"""
종합 진단 소견서 생성기 (Bedrock Claude + RAG 기반).

[이 파일이 하는 일]
운영 DB에 저장된 환자 컨텍스트(주호소/과거력/바이탈) + 4개 모달 원본 추론 결과를 읽어
Bedrock Claude에 투입하고, 구조화된 종합 소견서를 생성한다.

⭐ RAG 통합:
   - MIMIC 49,743건 노트(퇴원요약+영상보고서)에서 유사 환자 사례 검색
   - 검색된 사례를 Claude 프롬프트에 컨텍스트로 추가
   - "교과서 지식 + 유사 임상 사례" 기반 답변 생성

[호출 흐름]
POST /reports/{encounter_id}/generate
  → generate_integrated_report(encounter_id)
     ├─ 1. 운영 DB에서 환자 컨텍스트 조회 (ops_encounters)
     ├─ 2. 운영 DB에서 모달 원본 조회 (ops_modal_results: ECG/CXR/LAB)
     ├─ 3. RAG 검색 — 영문 query → ChromaDB → 유사 사례 3건            ⭐
     ├─ 4. Bedrock 프롬프트 구성 (모달 원본 + RAG 사례)               ⭐
     ├─ 5. Claude 호출
     └─ 6. 파싱 후 { diagnosis, risk_level, recommendations, similar_cases } 반환

[주의]
AI가 생성한 preliminary 소견서. 의사가 서명해야 final 상태로 전이 → EMR 연동.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import Any

from app.agent.bedrock_client import invoke_claude
from app.agent.rag import Retriever, FALLBACK_RESPONSE, SYSTEM_PROMPT
from app.db import encounters as ops_encounters
from app.db import modal_results as ops_modal_results

logger = logging.getLogger(__name__)

# Retriever는 ChromaDB+Bedrock 자원이라 모듈 단에서 1회 초기화 (lazy).
_retriever: Retriever | None = None


def _get_retriever() -> Retriever | None:
    """Lazy 초기화. ChromaDB 누락/Bedrock 권한 부재 시 None 반환 (RAG skip)."""
    global _retriever
    if _retriever is None:
        try:
            _retriever = Retriever()
        except Exception as e:
            logger.warning("[rag] Retriever 초기화 실패 — RAG 없이 진행: %s", e)
            _retriever = None  # 명시적으로 None 유지
            return None
    return _retriever


def _build_rag_query(encounter: dict[str, Any], modal_results: dict[str, Any]) -> str:
    """
    환자 정보 + 모달 결과 → RAG 검색용 영문 query.
    MIMIC 노트가 영문이라 영문화가 검색 정합성에 유리.
    """
    age = encounter.get("patient_age", "?")
    sex = encounter.get("patient_gender", "?")
    cc = encounter.get("chief_complaint", "")

    parts = [f"{age}yo {sex} patient with chief complaint: {cc}."]

    ecg = modal_results.get("ECG") or {}
    if ecg.get("summary"):
        parts.append(f"ECG: {ecg.get('summary', '')[:200]}")

    cxr = modal_results.get("CXR") or {}
    if cxr.get("impression") or cxr.get("summary"):
        parts.append(f"CXR: {(cxr.get('impression') or cxr.get('summary') or '')[:300]}")

    lab = modal_results.get("LAB") or {}
    if lab.get("summary"):
        parts.append(f"LAB: {lab.get('summary', '')[:200]}")

    return " ".join(parts)


# ── 모델 라우팅 — 케이스 난이도에 따라 Haiku(기본) / Sonnet(고난도) 자동 선택 ──
import os

# Global inference profile (ap-northeast-2 region 호환)
# - Haiku 4.5: 가장 저렴·빠른 최신 모델 (일반 케이스)
# - Sonnet 4.6: 한국어 의학 reasoning 강함 (고난도 케이스)
LLM_MODEL_HAIKU = os.getenv("RAG_LLM_HAIKU", "global.anthropic.claude-haiku-4-5-20251001-v1:0")
LLM_MODEL_SONNET = os.getenv("RAG_LLM_SONNET", "global.anthropic.claude-sonnet-4-6")
LLM_MAX_TOKENS = int(os.getenv("RAG_LLM_MAX_TOKENS", "2048"))

# safety-critical 키워드 — 등장하면 Sonnet으로 자동 승격
CRITICAL_KEYWORDS = [
    "cardiac arrest", "sepsis", "shock", "intubation", "code blue",
    "massive", "emergent", "critical", "unstable", "arrest",
    "hyperkalemia", "stemi", "nstemi", "stroke", "tamponade",
    "심정지", "패혈증", "쇼크", "삽관", "고칼륨혈증", "심근경색",
]


def select_model(similar_cases: list[dict], query: str) -> str:
    """
    케이스 난이도에 따라 Haiku(기본) 또는 Sonnet(고난도) 선택.

    Sonnet 사용 조건 (하나라도 해당):
    1) critical 키워드 (심정지/쇼크/심근경색/고칼륨혈증/패혈증 등)
    2) 멀티모달 종합 (discharge_summary + radiology RAG 사례 모두 보유)
    3) 검색 유사도 낮음 (top-1 < 0.35) — 흔치 않은 케이스
    """
    # 조건 1: critical 키워드
    all_text = (query or "").lower()
    for r in (similar_cases or [])[:3]:
        all_text += " " + (r.get("document") or "").lower()[:500]
    if any(kw in all_text for kw in CRITICAL_KEYWORDS):
        return LLM_MODEL_SONNET

    # 조건 2: 멀티모달 종합 사례
    chunk_types = {
        (r.get("metadata") or {}).get("chunk_type") for r in (similar_cases or [])
    }
    if "discharge_summary" in chunk_types and "radiology" in chunk_types:
        return LLM_MODEL_SONNET

    # 조건 3: 유사도 낮음
    if similar_cases and similar_cases[0].get("similarity", 1.0) < 0.35:
        return LLM_MODEL_SONNET

    return LLM_MODEL_HAIKU


# SYSTEM_PROMPT는 `app.agent.rag.generator`에서 import — RAG 팀원 모듈을 단일 출처로 사용.


def _format_similar_cases(similar_cases: list[dict]) -> str:
    """RAG 검색 결과를 Claude 프롬프트용 텍스트로 변환."""
    if not similar_cases:
        return "(유사 사례를 찾지 못함 — 일반 임상 지식만으로 판단)"
    parts = []
    for i, r in enumerate(similar_cases, 1):
        meta = r.get("metadata", {})
        chunk_type = meta.get("chunk_type", "unknown")
        hadm_id = meta.get("hadm_id", "?")
        sim = r.get("similarity", 0)
        doc = r.get("document", "")
        parts.append(
            f"[사례 {i}] (유형: {chunk_type}, hadm_id: {hadm_id}, 유사도: {sim:.3f})\n{doc}"
        )
    return "\n\n".join(parts)


def _build_user_prompt(
    encounter: dict[str, Any],
    modal_results: dict[str, Any],
    similar_cases: list[dict] | None = None,
) -> str:
    """Bedrock 사용자 프롬프트 구성."""
    meta = encounter.get("metadata") or {}
    if isinstance(meta, str):
        meta = json.loads(meta)

    # 환자 컨텍스트
    patient_ctx = {
        "age": encounter.get("patient_age"),
        "gender": encounter.get("patient_gender"),
        "chief_complaint": encounter.get("chief_complaint"),
        "past_history": meta.get("past_history", []),
        "vitals": meta.get("vitals", {}),
        "onset_minutes_ago": meta.get("onset_minutes_ago"),
    }

    rag_block = _format_similar_cases(similar_cases or [])

    return f"""[환자 컨텍스트]
{json.dumps(patient_ctx, indent=2, ensure_ascii=False)}

[ECG 모달 분석 결과 — 원본]
{json.dumps(modal_results.get("ECG", {"status": "not_performed"}), indent=2, ensure_ascii=False)}

[CXR 모달 분석 결과 — 원본]
{json.dumps(modal_results.get("CXR", {"status": "not_performed"}), indent=2, ensure_ascii=False)}

[Lab 모달 분석 결과 — 원본 (현재 + 6시간 후 예측 prognosis_6h 포함 가능)]
{json.dumps(modal_results.get("LAB", {"status": "not_performed"}), indent=2, ensure_ascii=False)}

[과거 유사 환자 사례 — MIMIC RAG 검색 결과]
{rag_block}

[오늘 날짜] {datetime.now().strftime('%Y. %m. %d')}

위 환자 컨텍스트와 모달 결과를 종합하여, SYSTEM_PROMPT의
'[최종 출력 형식]' 그대로 한국 응급실 표준 소견서를 작성하십시오.
- 첫 줄은 반드시 '상기 인은 {datetime.now().strftime('%Y. %m. %d')} 본원 응급실에 내원하여…' 로 시작.
- [진단 요약] 한 단락(3~6문장), [향후 치료 권고] 5~7개 항목, 면책 문구 1줄로 끝.
- 과거 유사 사례는 진단 추론에 참고만 하고, 본문에 'AI', '사례 N건', '신뢰도' 같은 메타 표현은 절대 쓰지 마십시오.
- 의사용 의료기록 형식이므로 학술 보고서나 분석 노트 톤이 아닌 임상 결론 톤으로 작성하십시오.
"""


async def generate_integrated_report(encounter_id: str) -> dict[str, Any]:
    """
    운영 DB에서 환자 컨텍스트 + 3개 모달 원본을 읽고 Bedrock으로 종합 소견서 생성.

    Returns:
        {
          "narrative": str,        # Claude의 5항목 자연어 서술
          "model_used": str,       # 실제 사용된 모델 ID (Haiku / Sonnet)
          "similar_cases": list,   # RAG 검색 결과 메타데이터
        }

    risk_level은 여기서 결정하지 않는다.
    각 모달(ECG/CXR/LAB)의 risk_level을 max-aggregation 하여 클라이언트가 결정.
    """
    # 1. 환자 컨텍스트 조회
    encounter = await ops_encounters.get_encounter(encounter_id)
    if encounter is None:
        raise ValueError(f"Encounter not found in ops DB: {encounter_id}")

    # 2. 모달 원본 조회 (ECG/CXR/LAB)
    modal_results = await ops_modal_results.get_all_modal_results(encounter_id)

    # 3. RAG 검색용 query는 RAG 가용성과 무관하게 항상 빌드
    #    (RAG 실패해도 select_model의 critical keyword 검출이 동작해야 함)
    rag_query = _build_rag_query(encounter, modal_results)

    similar_cases: list[dict] = []
    rag = _get_retriever()
    if rag is not None:
        try:
            search = await rag.search(rag_query)
            if not search.get("fallback"):
                similar_cases = search.get("results", [])
            logger.info(
                "[rag] enc=%s query=%r → cases=%d",
                encounter_id, rag_query[:120], len(similar_cases),
            )
        except Exception as e:
            logger.warning("[rag] 검색 실패 (RAG 없이 진행): %s", e)

    # 4. 모델 라우팅 — 케이스 난이도 기반 Haiku/Sonnet 자동 선택
    model_id = select_model(similar_cases, rag_query)
    model_name = "Sonnet" if "sonnet" in model_id else "Haiku"

    # 5. Bedrock 프롬프트 구성 (모달 + RAG 사례)
    user_prompt = _build_user_prompt(encounter, modal_results, similar_cases)

    logger.info(
        "[report_generator] Bedrock invoke (enc=%s, modals=%s, rag_cases=%d, model=%s)",
        encounter_id, list(modal_results.keys()), len(similar_cases), model_name,
    )

    # 6. Claude 호출 — narrative 자유서술 출력
    narrative = invoke_claude(
        system=SYSTEM_PROMPT,
        user=user_prompt,
        max_tokens=LLM_MAX_TOKENS,
        temperature=0.3,
        model_id=model_id,
    )

    return {
        "narrative": narrative,
        "model_used": model_name,
        "similar_cases": [
            {
                "chunk_type": (c.get("metadata") or {}).get("chunk_type"),
                "hadm_id": (c.get("metadata") or {}).get("hadm_id"),
                "similarity": c.get("similarity"),
                "snippet": (c.get("document") or "")[:300],
            }
            for c in similar_cases
        ],
        "_modal_results": modal_results,
        "_patient_context": {
            "age": encounter.get("patient_age"),
            "gender": encounter.get("patient_gender"),
            "chief_complaint": encounter.get("chief_complaint"),
        },
    }
