"""
3-stage pipeline: UNet -> DenseNet -> Clinical Logic.
이미지만 입력, findings + measurements 출력.
RAG/Report 없음 — 순수 이미지 분석.
"""

import io
import base64
import logging
import time

from PIL import Image

from layer1_segmentation.model import run_segmentation
from layer2_classification.densenet import run_densenet
from layer3_clinical_logic.engine import run_clinical_logic

logger = logging.getLogger(__name__)


def _decode_image(image_b64: str) -> Image.Image:
    """base64 -> RGB PIL Image."""
    image_bytes = base64.b64decode(image_b64)
    image = Image.open(io.BytesIO(image_bytes))
    return image.convert("RGB") if image.mode != "RGB" else image


def _extract_measurements(seg_result: dict) -> dict:
    """UNet 측정값을 flat dict로 추출 + SVG 오버레이용 픽셀 좌표 포함."""
    m = seg_result.get("measurements", {})
    cp = m.get("cp_angle", {})
    trachea = m.get("trachea", {})
    mediastinum = m.get("mediastinum", {})
    diaphragm = m.get("diaphragm", {})

    return {
        "ctr": m.get("ctr"),
        "ctr_status": m.get("ctr_status"),
        "heart_width_px": m.get("heart_width_px"),
        "thorax_width_px": m.get("thorax_width_px"),
        "right_cp_angle": m.get("cp_angle_right"),
        "left_cp_angle": m.get("cp_angle_left"),
        "right_cp_status": cp.get("right", {}).get("status"),
        "left_cp_status": cp.get("left", {}).get("status"),
        "lung_area_ratio": m.get("lung_area_ratio"),
        "mediastinum_status": mediastinum.get("status"),
        "trachea_midline": trachea.get("midline"),
        "trachea_deviation_direction": trachea.get("deviation_direction"),
        "diaphragm_status": diaphragm.get("status"),
        # SVG 오버레이용 픽셀 좌표 (원본 이미지 스케일)
        "ctr_lines": m.get("ctr_lines") if "ctr_lines" in m else None,
        "cp_angle_coords": {
            "left": cp.get("left", {}).get("point"),
            "right": cp.get("right", {}).get("point"),
        } if cp else None,
        "diaphragm_coords": {
            "left": diaphragm.get("left_dome_point"),
            "right": diaphragm.get("right_dome_point"),
        } if diaphragm else None,
        "trachea_coords": {
            "thorax_center_x": trachea.get("thorax_center_x"),
            "mediastinum_center_x": trachea.get("mediastinum_center_x"),
            "midline": trachea.get("midline"),
            "deviation_direction": trachea.get("deviation_direction"),
            "y_start": trachea.get("trachea_y_start"),
            "y_end": trachea.get("trachea_y_end"),
        } if trachea else None,
        "mediastinum_coords": {
            "x_left": mediastinum.get("x_left"),
            "x_right": mediastinum.get("x_right"),
            "y_level": mediastinum.get("measurement_y_level"),
        } if mediastinum else None,
    }


async def run_pipeline(models: dict, image_b64: str) -> dict:
    """
    3-stage 파이프라인 실행.

    Args:
        models: {"unet": ort session, "densenet": ort session}
        image_b64: base64 encoded chest X-ray image

    Returns:
        dict: {status, findings, measurements, risk_level, summary, mask_base64, metadata}
    """
    t_start = time.time()
    timings = {}

    # ── Stage 1: UNet 세그멘테이션 ────────────────────────────
    t0 = time.time()
    pil_image = _decode_image(image_b64)
    seg_result = run_segmentation(models["unet"], pil_image)
    timings["segmentation_ms"] = round((time.time() - t0) * 1000)
    logger.info(f"Stage 1 (seg): CTR={seg_result['measurements']['ctr']:.4f}, "
                f"view={seg_result['view']}, {timings['segmentation_ms']}ms")

    # Lateral view -> 조기 반환
    if seg_result.get("view") == "Lateral":
        logger.warning("Lateral view detected — unsupported")
        return {
            "status": "unsupported_view",
            "modal": "chest",
            "findings": [],
            "measurements": _extract_measurements(seg_result),
            "risk_level": "routine",
            "summary": "Lateral view detected. PA/AP views only.",
            "mask_base64": seg_result.get("mask_base64"),
            "metadata": {
                "view": "Lateral",
                "total_time_ms": round((time.time() - t_start) * 1000),
                "diseases_evaluated": 0,
            },
        }

    # ── Stage 2: DenseNet 분류 ────────────────────────────────
    t0 = time.time()
    densenet_result = run_densenet(models["densenet"], pil_image)
    timings["classification_ms"] = round((time.time() - t0) * 1000)
    detected_names = [k for k, v in densenet_result.items()
                      if isinstance(v, dict) and v.get("detected")]
    logger.info(f"Stage 2 (densenet): {len(detected_names)} detected, {timings['classification_ms']}ms")

    # ── Stage 3: Clinical Logic ───────────────────────────────
    t0 = time.time()
    clinical_result = run_clinical_logic(densenet_result, seg_result)
    timings["clinical_logic_ms"] = round((time.time() - t0) * 1000)
    logger.info(f"Stage 3 (logic): risk={clinical_result['risk_level']}, {timings['clinical_logic_ms']}ms")

    total_ms = round((time.time() - t_start) * 1000)

    measurements = _extract_measurements(seg_result)

    return {
        "status": "success",
        "modal": "chest",
        "findings": clinical_result["findings"],
        "measurements": measurements,
        "risk_level": clinical_result["risk_level"],
        "summary": clinical_result["summary"],
        "findings_text": clinical_result.get("findings_text", ""),
        "impression": clinical_result.get("impression", ""),
        "rag_query_hints": clinical_result.get("rag_query_hints", []),
        "mask_base64": seg_result.get("mask_base64"),
        "metadata": {
            "view": seg_result.get("view", "unknown"),
            "image_size": [pil_image.width, pil_image.height],
            "original_size": seg_result.get("original_size"),
            **timings,
            "total_time_ms": total_ms,
            "diseases_evaluated": 6,
        },
    }
