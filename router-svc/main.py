"""
router-svc main.py — FastAPI 진입점

역할:
  - orchestrator 장애 시 의사 직접 action을 각 모달 서비스로 라우팅 (폴백 경로)
  - Stateless: DB 연결 없음, 세션 없음

엔드포인트:
  GET  /health           — 헬스체크 (ALB)
  GET  /ready            — Readiness probe
  GET  /                 — 서비스 정보
  GET  /route/status     — 모달 서비스 헬스 상태 반환
  POST /route/ecg        — ECG 서비스로 프록시 (단일 모달 호출)
  POST /route/cxr        — CXR 서비스로 프록시 (단일 모달 호출)
  POST /route/lab        — LAB 서비스로 프록시 (단일 모달 호출)
  POST /route/rag        — RAG 서비스 /query로 프록시 (검색 전용)
  POST /route/analyze    — 폴백 종합 분석
                           (모달 호출 + context 조립 + RAG /generate or Bedrock 직접 호출)

/route/analyze request body 스펙:
  {
    "patient_info": {
      "age": 65,
      "gender": "M",
      "chief_complaint": "흉통",
      "vitals": { "hr": 110, "sbp": 140, "dbp": 90, "spo2": 96, "rr": 20, "temp": 37.5 },
      "past_history": ["HTN", "DM"]
    },
    "modal_results": {
      // 살아있는 모달: 프론트가 직접 호출해서 받아온 추론 결과 dict
      // 장애 모달: 의사가 직접 입력한 텍스트 (str)
      // 없는 모달: null 또는 키 자체 생략
      "ECG": { "summary": "...", "risk_level": "critical", ... },  // 정상 모달 결과
      "CXR": "흉부 X-ray: 우측 하엽 경화 소견",                   // 장애 모달 직접 입력
      "LAB": null                                                    // 미실시 모달
    },
    "available_modals": ["ECG"],    // router가 직접 호출할 모달 (modal_results에 없는 것 중)
    "modal_data": {                 // available_modals 호출 시 필요한 데이터
      "ECG": { "record_path": "s3://...", "leads": 12 }
    }
  }

  응답:
  {
    "narrative": "1. 주요 소견 분석 ...",
    "source": "rag" | "bedrock_direct",
    "modal_results_used": ["ECG", "CXR"],
    "stored": false   // A 옵션: Aurora 저장 없음
  }
"""

import asyncio
import json
import logging
import sys
from contextlib import asynccontextmanager
from typing import Any

import boto3
import httpx
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from config import (
    HOST,
    PORT,
    LOG_LEVEL,
    ECG_SVC_URL,
    CXR_SVC_URL,
    LAB_SVC_URL,
    RAG_SVC_URL,
    REQUEST_TIMEOUT,
    AWS_REGION,
    BEDROCK_MODEL_ID,
)

# ------------------------------------------------------------------
# 로깅
# ------------------------------------------------------------------
logging.basicConfig(
    level=LOG_LEVEL.upper(),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("router-svc")

# ------------------------------------------------------------------
# HTTP 클라이언트 + Bedrock 클라이언트 (lifespan 관리)
# ------------------------------------------------------------------
http_client: httpx.AsyncClient | None = None
bedrock_client = None

MODAL_URLS = {
    "ECG": ECG_SVC_URL,
    "CXR": CXR_SVC_URL,
    "LAB": LAB_SVC_URL,
}
MODAL_HEALTH_PATHS = {
    "ECG": "/health",
    "CXR": "/healthz",
    "LAB": "/health",
}

# RAG 장애 시 router가 직접 Bedrock을 호출할 때 사용하는 프롬프트
SYSTEM_PROMPT = (
    "당신은 철저하게 증거 기반(Evidence-based)으로 사고하는 대학병원 응급의학과 전문의입니다. "
    "제공된 [환자 컨텍스트]와 [모달 분석 결과]를 바탕으로 최종 소견을 작성합니다. "
    "반드시 아래 5가지 항목으로 번호를 매겨 한국어로 작성하십시오:\n"
    "1. 주요 소견 분석 — 비정상 검사 결과의 구체적 수치와 임상적 의미\n"
    "2. 과거 사례 비교 — RAG 장애로 사례 없음 (일반 임상 지식으로 판단)\n"
    "3. 예상 진단 — 가장 가능성 높은 진단명과 감별 진단\n"
    "4. 위험도 평가 — 긴급 조치 필요 여부, 합병증 위험\n"
    "5. 권고 사항 — 추가 검사, 치료 방향, 전문과 협진 필요 여부\n\n"
    "본 소견서는 임상 판단 보조용 초안(preliminary)이며, 최종 결정은 담당 의사가 내립니다."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client, bedrock_client
    logger.info("Router service starting...")
    http_client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT)
    try:
        bedrock_client = boto3.client("bedrock-runtime", region_name=AWS_REGION)
        logger.info("Bedrock client initialized (RAG 장애 시 폴백용)")
    except Exception as e:
        logger.warning("Bedrock client init failed: %s", e)
    logger.info("Router service ready")
    yield
    logger.info("Router service shutting down...")
    await http_client.aclose()
    logger.info("HTTP client closed")


# ------------------------------------------------------------------
# FastAPI 앱
# ------------------------------------------------------------------
app = FastAPI(
    title="Router Service",
    description="Stateless fallback routing layer for modal services",
    version="1.0.0",
    lifespan=lifespan,
)


# ------------------------------------------------------------------
# Pydantic 모델
# ------------------------------------------------------------------
class PatientInfo(BaseModel):
    age: int | None = None
    gender: str | None = None
    chief_complaint: str | None = None
    vitals: dict[str, Any] | None = None
    past_history: list[str] | None = None


class AnalyzeRequest(BaseModel):
    """
    POST /route/analyze 요청 body.
    상단 docstring의 스펙 참조.
    """
    patient_info: PatientInfo
    # 프론트가 이미 갖고 있는 모달 결과
    # - 살아있는 모달: 추론 결과 dict (프론트가 /route/ecg 등으로 직접 호출해서 받아온 것)
    # - 장애 모달: 의사가 직접 입력한 텍스트 str
    # - 미실시/불필요 모달: null 또는 키 생략 (둘 다 동일하게 처리됨)
    #   예) "ECG": null  ←→  ECG 키 자체 없음  →  둘 다 "not_performed"로 처리
    modal_results: dict[str, dict[str, Any] | str | None] = {}
    # router가 직접 호출할 모달 목록 (modal_results에 없는 것 중)
    available_modals: list[str] = []
    # available_modals 호출 시 각 모달에 넘길 데이터 (record_path, image_base64 등)
    modal_data: dict[str, dict[str, Any]] = {}


# ------------------------------------------------------------------
# 헬퍼: HTTP 프록시
# ------------------------------------------------------------------
async def proxy_post(
    target_url: str,
    service_name: str,
    body: dict[str, Any],
) -> dict[str, Any]:
    try:
        logger.info("POST %s (%s)", target_url, service_name)
        response = await http_client.post(
            target_url,
            json=body,
            headers={"Content-Type": "application/json"},
        )
        if response.status_code >= 400:
            logger.error("%s %d: %s", service_name, response.status_code, response.text[:300])
            raise HTTPException(
                status_code=response.status_code,
                detail=f"{service_name} error: {response.text[:300]}",
            )
        logger.info("%s OK (%d)", service_name, response.status_code)
        return response.json()
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail=f"{service_name} timeout after {REQUEST_TIMEOUT}s")
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Cannot connect to {service_name}: {e}")
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected proxy error to %s", service_name)
        raise HTTPException(status_code=500, detail=f"Router internal error: {type(e).__name__}")


async def check_health(url: str, path: str) -> bool:
    """단일 서비스 헬스체크. 200 응답이면 True."""
    try:
        resp = await http_client.get(f"{url.rstrip('/')}{path}", timeout=5.0)
        return resp.status_code == 200
    except Exception:
        return False


# ------------------------------------------------------------------
# 헬퍼: Bedrock 직접 호출 (RAG 장애 시 폴백)
# ------------------------------------------------------------------
def _invoke_bedrock_direct(
    patient_info: PatientInfo,
    modal_results: dict[str, Any],
) -> str:
    """
    RAG 서비스 장애 시 router가 직접 Bedrock Claude 호출.
    similar_cases 없이 일반 임상 지식 기반 소견 생성.
    """
    patient_ctx = {
        "age": patient_info.age,
        "gender": patient_info.gender,
        "chief_complaint": patient_info.chief_complaint,
        "vitals": patient_info.vitals or {},
        "past_history": patient_info.past_history or [],
    }

    modal_block = ""
    for modality in ["ECG", "CXR", "LAB"]:
        result = modal_results.get(modality)
        if result is None:
            modal_block += f'\n[{modality} 분석 결과]\n{{"status": "not_performed"}}\n'
        elif isinstance(result, str):
            modal_block += f"\n[{modality} 분석 결과 — 의사 직접 입력]\n{result}\n"
        else:
            modal_block += (
                f"\n[{modality} 분석 결과]\n"
                f"{json.dumps(result, ensure_ascii=False, indent=2)}\n"
            )

    user_prompt = f"""[환자 컨텍스트]
{json.dumps(patient_ctx, ensure_ascii=False, indent=2)}
{modal_block}
[과거 유사 환자 사례]
(RAG 서비스 장애 — 일반 임상 지식만으로 판단)

위 정보를 종합하여 5항목 한국어 자연어 서술을 작성하십시오."""

    resp = bedrock_client.invoke_model(
        modelId=BEDROCK_MODEL_ID,
        contentType="application/json",
        accept="application/json",
        body=json.dumps({
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": 2048,
            "temperature": 0.3,
            "system": SYSTEM_PROMPT,
            "messages": [{"role": "user", "content": user_prompt}],
        }),
    )
    result = json.loads(resp["body"].read())
    return result["content"][0]["text"]


# ------------------------------------------------------------------
# 헬스체크
# ------------------------------------------------------------------
@app.get("/health")
async def health():
    return {"status": "healthy", "service": "router-svc"}


@app.get("/ready")
async def ready():
    return {"status": "ready", "service": "router-svc"}


@app.get("/")
async def root():
    return {
        "service": "router-svc",
        "version": "1.0.0",
        "description": "Stateless fallback routing layer",
        "endpoints": {
            "status":  "GET /route/status",
            "ecg":     "POST /route/ecg",
            "cxr":     "POST /route/cxr",
            "lab":     "POST /route/lab",
            "rag":     "POST /route/rag",
            "analyze": "POST /route/analyze",
        },
    }


# ------------------------------------------------------------------
# 모달 상태 조회
# ------------------------------------------------------------------
@app.get("/route/status")
async def modal_status():
    """
    모달 서비스 헬스 상태 반환.
    프론트가 이걸 호출해서 장애 모달 파악 → 수동 입력 UI 표시.
    """
    ecg_ok, cxr_ok, lab_ok = await asyncio.gather(
        check_health(ECG_SVC_URL, MODAL_HEALTH_PATHS["ECG"]),
        check_health(CXR_SVC_URL, MODAL_HEALTH_PATHS["CXR"]),
        check_health(LAB_SVC_URL, MODAL_HEALTH_PATHS["LAB"]),
    )
    return {
        "ECG": "healthy" if ecg_ok else "down",
        "CXR": "healthy" if cxr_ok else "down",
        "LAB": "healthy" if lab_ok else "down",
    }


# ------------------------------------------------------------------
# 단일 모달 프록시 (의사 개별 action)
# ------------------------------------------------------------------
@app.post("/route/ecg")
async def route_ecg(request: Request):
    """ECG 서비스로 프록시 (의사 직접 오더)"""
    return await proxy_post(f"{ECG_SVC_URL}/predict", "ECG Service", await request.json())


@app.post("/route/cxr")
async def route_cxr(request: Request):
    """CXR 서비스로 프록시 (의사 직접 오더)"""
    return await proxy_post(f"{CXR_SVC_URL}/predict", "CXR Service", await request.json())


@app.post("/route/lab")
async def route_lab(request: Request):
    """LAB 서비스로 프록시 (의사 직접 오더)"""
    return await proxy_post(f"{LAB_SVC_URL}/predict", "LAB Service", await request.json())


@app.post("/route/rag")
async def route_rag(request: Request):
    """RAG /query 프록시 (검색 전용, orchestrator 정상 시 사용)"""
    return await proxy_post(f"{RAG_SVC_URL}/query", "RAG Service", await request.json())


# ------------------------------------------------------------------
# 폴백 종합 분석 (시나리오 1, 3)
# ------------------------------------------------------------------
@app.post("/route/analyze")
async def analyze(req: AnalyzeRequest):
    """
    orchestrator 장애 시 폴백 종합 분석.

    흐름:
      1. available_modals → 지정한 모달만 호출 (의사 action 기반, 전체 병렬 아님)
      2. req.modal_results → 프론트가 이미 갖고 있는 결과 병합
         (살아있는 모달 결과 dict, 장애 모달 의사 입력 텍스트)
      3. context 조립 → RAG /generate 호출
      4. RAG 장애 시 → Bedrock 직접 호출
      5. narrative 반환 (Aurora 저장 없음 — A 옵션, stored: false)
    """
    # 1. router가 직접 호출할 모달 (available_modals에 있는 것만)
    modal_results: dict[str, Any] = {}

    async def call_modal(modality: str) -> tuple[str, Any]:
        url = MODAL_URLS.get(modality.upper())
        if not url:
            logger.warning("Unknown modality: %s", modality)
            return modality, None
        data = req.modal_data.get(modality, {})
        payload = {
            "patient_info": req.patient_info.model_dump(exclude_none=True),
            "data": data,
            "context": {},
        }
        try:
            result = await proxy_post(f"{url}/predict", f"{modality} Service", payload)
            return modality, result
        except HTTPException as e:
            logger.warning("%s call failed: %s", modality, e.detail)
            return modality, None

    if req.available_modals:
        tasks = [call_modal(m) for m in req.available_modals]
        gathered = await asyncio.gather(*tasks)
        for modality, result in gathered:
            if result is not None:
                modal_results[modality.upper()] = result

    # 2. 프론트가 갖고 있던 결과 병합
    #    (살아있는 모달 추론 결과 dict, 장애 모달 의사 직접 입력 str)
    for modality, result in req.modal_results.items():
        if result is not None:
            modal_results[modality.upper()] = result

    if not modal_results:
        raise HTTPException(
            status_code=400,
            detail="No modal results. Provide available_modals or modal_results.",
        )

    # 3. context 조립 후 RAG /generate 호출
    context_payload = {
        "patient_info": req.patient_info.model_dump(exclude_none=True),
        "modal_results": modal_results,
    }

    narrative: str | None = None
    rag_available = await check_health(RAG_SVC_URL, "/health")

    if rag_available:
        try:
            rag_result = await proxy_post(
                f"{RAG_SVC_URL}/generate",
                "RAG Service",
                context_payload,
            )
            narrative = rag_result.get("narrative")
            logger.info("RAG /generate succeeded")
        except Exception as e:
            logger.warning("RAG /generate failed, falling back to Bedrock: %s", e)

    # 4. RAG 장애 시 Bedrock 직접 호출
    if not narrative:
        if not bedrock_client:
            raise HTTPException(
                status_code=503,
                detail="Both RAG service and Bedrock client are unavailable.",
            )
        try:
            logger.info("Calling Bedrock directly (RAG unavailable)")
            narrative = _invoke_bedrock_direct(req.patient_info, modal_results)
        except Exception as e:
            logger.exception("Bedrock direct call failed")
            raise HTTPException(status_code=500, detail=f"Report generation failed: {e}")

    # 5. 반환 (Aurora 저장 없음 — A 옵션)
    return {
        "narrative": narrative,
        "source": "rag" if rag_available and narrative else "bedrock_direct",
        "rag_available": rag_available,  # False면 프론트에서 "유사 사례 검색 불가" 안내
        "modal_results_used": list(modal_results.keys()),
        "stored": False,
    }


# ------------------------------------------------------------------
# 전역 예외 핸들러
# ------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled exception: %s", exc)
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal router error: {type(exc).__name__}"},
    )


# ------------------------------------------------------------------
# 직접 실행
# ------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=HOST,
        port=PORT,
        log_level=LOG_LEVEL.lower(),
        reload=False,
    )
