"""
RAG API Server

엔드포인트:
  GET  /health      — 헬스체크
  POST /query       — RAG 검색만 반환 (orchestrator 정상 경로)
  POST /generate    — 검색 + 프롬프팅 + Bedrock 호출 + 소견 반환
                      (orchestrator 정상 경로 및 router 폴백 경로 공용)

/query 호출자:
  - orchestrator (정상 시): 검색 결과만 받아서 자체 Bedrock 호출

/generate 호출자:
  - orchestrator (정상 시): 소견 생성까지 위임
  - router-svc (orchestrator 장애 시): context 조립 후 소견 생성 위임
"""

import os
import json
import time
import logging

import boto3
import chromadb
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from botocore.exceptions import ClientError
from typing import Any

from app.retrieval_query_builder import build_retrieval_query
from app.central_final_opinion_builder import (
    build_final_prompt_package,
    invoke_bedrock_final_opinion,
)

# ──────────────────────────────────────────────
# 설정
# ──────────────────────────────────────────────
CHROMA_DB_DIR = os.environ.get("CHROMA_DB_DIR", "./local_rag_db")
COLLECTION_NAME = "medical_rag_collection"
EMBED_MODEL_ID = "amazon.titan-embed-text-v2:0"
EMBED_DIMENSIONS = 512

TOP_K_FETCH = 20
TOP_K_FINAL = 3
MIN_SIMILARITY = 0.15

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s — %(message)s")
logger = logging.getLogger("rag-svc")

# ──────────────────────────────────────────────
# FastAPI App
# ──────────────────────────────────────────────
app = FastAPI(title="RAG Service", version="2.0.0")

# 글로벌 클라이언트 (부팅 시 1회 초기화)
bedrock_client = None
collection = None


@app.on_event("startup")
def startup():
    global bedrock_client, collection
    region = os.environ.get("AWS_REGION", os.environ.get("AWS_DEFAULT_REGION", "ap-northeast-2"))
    bedrock_client = boto3.client("bedrock-runtime", region_name=region)
    client = chromadb.PersistentClient(path=CHROMA_DB_DIR)
    collection = client.get_collection(name=COLLECTION_NAME)
    logger.info("[startup] ChromaDB loaded: %d documents", collection.count())


# ──────────────────────────────────────────────
# API Models
# ──────────────────────────────────────────────
class QueryRequest(BaseModel):
    query: str


class SearchResult(BaseModel):
    id: str
    document: str
    metadata: dict
    similarity: float


class QueryResponse(BaseModel):
    results: list[SearchResult]
    fallback: bool


class PatientInfo(BaseModel):
    """router-svc 및 orchestrator에서 넘기는 환자 정보."""
    age: int | None = None
    gender: str | None = None
    chief_complaint: str | None = None
    vitals: dict[str, Any] | None = None
    past_history: list[str] | None = None


class GenerateRequest(BaseModel):
    """
    POST /generate 요청 body.

    호출자:
      - orchestrator (정상 경로): encounter_id 포함 가능
      - router-svc (폴백 경로): encounter_id 없음 → Aurora 저장 스킵

    modal_results 형식:
      - 살아있는 모달: 추론 결과 dict
      - 장애 모달 의사 직접 입력: str
      - 미실시/없음: null 또는 키 생략 (동일하게 처리)
    """
    patient_info: PatientInfo
    modal_results: dict[str, Any] = {}
    encounter_id: str | None = None  # None이면 Aurora 저장 스킵


class GenerateResponse(BaseModel):
    narrative: str
    model_used: str
    rag_fallback: bool
    similar_cases: list[dict]
    stored: bool  # Aurora 저장 여부 (encounter_id 없으면 항상 False)
    warnings: list[str] = []


# ──────────────────────────────────────────────
# Endpoints
# ──────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "documents": collection.count() if collection else 0}


@app.post("/query", response_model=QueryResponse)
def query_rag(req: QueryRequest):
    """
    RAG 검색만 수행하고 Top-K 결과를 반환한다.
    orchestrator가 직접 Bedrock을 호출하는 경로에서 사용.
    """
    if not req.query.strip():
        raise HTTPException(status_code=400, detail="query is empty")

    query_vec = _embed(req.query)

    raw = collection.query(
        query_embeddings=[query_vec],
        n_results=TOP_K_FETCH,
        include=["documents", "metadatas", "distances"],
    )

    candidates = []
    for i in range(len(raw["ids"][0])):
        similarity = 1 - raw["distances"][0][i]
        candidates.append(SearchResult(
            id=raw["ids"][0][i],
            document=raw["documents"][0][i],
            metadata=raw["metadatas"][0][i],
            similarity=round(similarity, 4),
        ))

    if not candidates or candidates[0].similarity < MIN_SIMILARITY:
        return QueryResponse(results=[], fallback=True)

    selected = _diversity_filter(candidates)
    return QueryResponse(results=selected, fallback=False)


@app.post("/generate", response_model=GenerateResponse)
def generate_narrative(req: GenerateRequest):
    """
    RAG 검색 + 프롬프팅 + Bedrock 호출 + 소견 반환.

    호출 흐름:
      1. patient_info + modal_results → retrieval_query_builder로 검색 query 생성
      2. ChromaDB 검색 → Top-K 유사 사례
      3. central_final_opinion_builder로 프롬프트 패키지 생성 + Bedrock 호출
      4. 후처리 후 narrative 반환
      5. encounter_id 있으면 Aurora 저장 (현재 미구현 — 모달 서비스가 직접 저장)
         encounter_id 없으면 저장 스킵 (router 폴백 경로)
    """
    if not req.modal_results and not req.patient_info.chief_complaint:
        raise HTTPException(
            status_code=400,
            detail="modal_results 또는 patient_info.chief_complaint 중 하나는 필요합니다.",
        )

    # 1. retrieval_query_builder로 검색 query 생성
    query_result = build_retrieval_query(
        patient_summary=req.patient_info.chief_complaint,
        chief_complaint=req.patient_info.chief_complaint,
        vitals=req.patient_info.vitals,
        modal_results=req.modal_results or {},
    )
    logger.info(
        "[generate] enc=%s query_chars=%d truncated=%s",
        req.encounter_id, query_result.char_count, query_result.truncated,
    )

    # 2. ChromaDB 검색
    rag_response: dict[str, Any] = {"results": [], "fallback": True}
    try:
        query_vec = _embed(query_result.query)
        raw = collection.query(
            query_embeddings=[query_vec],
            n_results=TOP_K_FETCH,
            include=["documents", "metadatas", "distances"],
        )
        candidates = []
        for i in range(len(raw["ids"][0])):
            similarity = 1 - raw["distances"][0][i]
            candidates.append({
                "id": raw["ids"][0][i],
                "document": raw["documents"][0][i],
                "metadata": raw["metadatas"][0][i],
                "similarity": round(similarity, 4),
            })

        if candidates and candidates[0]["similarity"] >= MIN_SIMILARITY:
            selected = _diversity_filter_dicts(candidates)
            rag_response = {"results": selected, "fallback": False}
            logger.info("[generate] RAG search OK: %d cases", len(selected))
        else:
            logger.info("[generate] RAG fallback: no similar cases above threshold")

    except Exception as e:
        logger.warning("[generate] ChromaDB search failed, proceeding with fallback: %s", e)

    # 3. 프롬프트 패키지 생성 + Bedrock 호출
    package = build_final_prompt_package(
        patient_summary=req.patient_info.chief_complaint,
        chief_complaint=req.patient_info.chief_complaint,
        vitals=req.patient_info.vitals,
        modal_results=req.modal_results or {},
        rag_response=rag_response,
    )
    logger.info(
        "[generate] Bedrock invoke: model=%s reason=%s rag_fallback=%s",
        package.selected_model, package.selected_model_reason, package.rag_fallback,
    )

    opinion = invoke_bedrock_final_opinion(package, bedrock_client=bedrock_client)

    if not opinion.valid_required_sections:
        logger.warning("[generate] missing sections: %s", opinion.missing_sections)

    # 4. encounter_id 없으면 Aurora 저장 스킵 (router 폴백 경로)
    #    encounter_id 있어도 현재는 모달 서비스가 직접 저장하므로 저장 안 함
    #    향후 소견서 저장이 필요하면 여기에 Aurora write 로직 추가
    stored = False

    model_name = "Sonnet" if "sonnet" in package.selected_model.lower() else "Haiku"

    return GenerateResponse(
        narrative=opinion.text,
        model_used=model_name,
        rag_fallback=package.rag_fallback,
        similar_cases=[
            {
                "chunk_type": (r.get("metadata") or {}).get("chunk_type"),
                "hadm_id": (r.get("metadata") or {}).get("hadm_id"),
                "similarity": r.get("similarity"),
                "snippet": (r.get("document") or "")[:300],
            }
            for r in rag_response.get("results", [])
        ],
        stored=stored,
        warnings=opinion.warnings + query_result.warnings,
    )


# ──────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────
def _embed(text: str) -> list[float]:
    truncated = text[:8000]
    body = json.dumps({"inputText": truncated, "dimensions": EMBED_DIMENSIONS})

    for attempt in range(1, 4):
        try:
            resp = bedrock_client.invoke_model(
                modelId=EMBED_MODEL_ID,
                contentType="application/json",
                accept="application/json",
                body=body,
            )
            return json.loads(resp["body"].read())["embedding"]
        except ClientError:
            time.sleep(2 ** attempt)

    raise HTTPException(status_code=502, detail="Bedrock embedding failed")


def _diversity_filter(candidates: list[SearchResult]) -> list[SearchResult]:
    discharge = [c for c in candidates if c.metadata.get("chunk_type") == "discharge_summary"]
    radiology = [c for c in candidates if c.metadata.get("chunk_type") == "radiology"]

    selected = []
    if discharge:
        selected.append(discharge[0])
    if radiology:
        selected.append(radiology[0])

    selected_ids = {s.id for s in selected}
    for c in candidates:
        if len(selected) >= TOP_K_FINAL:
            break
        if c.id not in selected_ids:
            selected.append(c)

    selected.sort(key=lambda x: x.similarity, reverse=True)
    return selected[:TOP_K_FINAL]


def _diversity_filter_dicts(candidates: list[dict]) -> list[dict]:
    """/generate 내부에서 dict 형태 candidates에 사용하는 diversity filter."""
    discharge = [c for c in candidates if (c.get("metadata") or {}).get("chunk_type") == "discharge_summary"]
    radiology = [c for c in candidates if (c.get("metadata") or {}).get("chunk_type") == "radiology"]

    selected = []
    if discharge:
        selected.append(discharge[0])
    if radiology:
        selected.append(radiology[0])

    selected_ids = {s["id"] for s in selected}
    for c in candidates:
        if len(selected) >= TOP_K_FINAL:
            break
        if c["id"] not in selected_ids:
            selected.append(c)

    selected.sort(key=lambda x: x.get("similarity", 0), reverse=True)
    return selected[:TOP_K_FINAL]
