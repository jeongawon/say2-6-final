"""
chest-svc-v2 — FastAPI + lifespan (UNet + DenseNet 2-model).
순수 이미지 분석 엔진. YOLO/RAG/Report 없음.

K8s 12-Factor 마이크로서비스:
  - pydantic-settings 기반 환경변수 관리
  - lifespan으로 ONNX 모델 startup/shutdown
  - /healthz (liveness) + /readyz (readiness)
  - 3-stage pipeline (seg -> densenet -> clinical logic)
"""

import sys
import os
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# shared schemas import
sys.path.insert(0, "/app/shared")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "shared"))
from schemas import PredictRequest, PredictResponse, Finding

from config import settings
from pipeline import run_pipeline

logging.basicConfig(
    level=getattr(logging, settings.log_level.upper(), logging.INFO),
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
)
logger = logging.getLogger("chest-svc-v2")

state = {"ready": False, "models": {}}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """UNet + DenseNet 2개 모델 로드. YOLO 없음, report_generator 없음."""
    import onnxruntime as ort

    sess_opts = ort.SessionOptions()
    sess_opts.inter_op_num_threads = 1
    sess_opts.intra_op_num_threads = 2
    sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    providers = ["CPUExecutionProvider"]

    logger.info(f"Loading 2 ONNX models from {settings.model_dir} ...")

    state["models"]["unet"] = ort.InferenceSession(
        f"{settings.model_dir}/unet.onnx", sess_opts, providers=providers)
    logger.info("  unet loaded")

    state["models"]["densenet"] = ort.InferenceSession(
        f"{settings.model_dir}/densenet.onnx", sess_opts, providers=providers)
    logger.info("  densenet loaded")

    state["ready"] = True
    logger.info("chest-svc-v2 ready (2 models loaded).")

    yield

    state["models"].clear()
    state["ready"] = False


app = FastAPI(title="chest-svc-v2", version="2.0.0", lifespan=lifespan)

# CORS — 프론트엔드 dev 서버(Vite :5173) 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 테스트 이미지 정적 서빙
_base = Path(__file__).parent
_test_images = _base / "test-images"
if _test_images.exists():
    app.mount("/test-images", StaticFiles(directory=str(_test_images)), name="test-images")

# 빌드된 프론트엔드 정적 서빙 (있을 경우)
_static = _base / "static"
if _static.exists():
    app.mount("/static", StaticFiles(directory=str(_static), html=True), name="static")


@app.get("/healthz")
def liveness():
    return {"status": "ok"}


@app.get("/readyz")
def readiness():
    if not state["ready"]:
        raise HTTPException(503, "models loading")
    return {"status": "ready", "models": list(state["models"].keys())}


@app.get("/test-cases")
def list_test_cases():
    """테스트 이미지 목록 반환 — 프론트엔드 테스트케이스 선택용."""
    cases = {}
    if _test_images.exists():
        for disease_dir in sorted(_test_images.iterdir()):
            if disease_dir.is_dir():
                images = sorted([f.name for f in disease_dir.iterdir()
                                if f.suffix.lower() in ('.jpg', '.jpeg', '.png')])
                cases[disease_dir.name] = {
                    "images": images,
                    "count": len(images),
                }
    return cases


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest):
    """흉부 X선 6개 질환 분석. 이미지만 사용, patient_info/context는 무시."""
    if not state["ready"]:
        raise HTTPException(503, "not ready")

    image_b64 = req.data.get("image_base64", "")
    if not image_b64:
        raise HTTPException(400, "'image_base64' required in data")

    try:
        result = await run_pipeline(models=state["models"], image_b64=image_b64)
    except Exception as e:
        logger.error(f"Pipeline error: {e}", exc_info=True)
        raise HTTPException(500, f"Pipeline error: {str(e)}")

    # findings 통합 — verification/evidence/impression_text 포함 (pipeline_findings 제거)
    findings = [
        Finding(
            name=f["name"],
            detected=f["detected"],
            confidence=f["confidence"],
            detail="; ".join(f.get("evidence", [])),
            secondary=False,
            severity=f.get("severity"),
            location=f.get("location"),
            recommendation=f.get("recommendation"),
            verification=f.get("verification"),
            evidence=f.get("evidence", []),
            impression_text=f.get("impression_text"),
        )
        for f in result["findings"]
    ]

    # metadata — 부가 정보만 (view, image_size, timings, mask)
    metadata = result.get("metadata", {})
    metadata["mask_base64"] = result.get("mask_base64")

    return PredictResponse(
        status=result["status"],
        modal="chest",
        findings=findings,
        summary=result.get("summary", ""),
        report="",
        risk_level=result.get("risk_level", "routine"),
        findings_text=result.get("findings_text", ""),
        impression=result.get("impression", ""),
        measurements=result.get("measurements", {}),
        rag_query_hints=result.get("rag_query_hints", []),
        pertinent_negatives=[],
        suggested_next_actions=[],
        metadata=metadata,
    )
