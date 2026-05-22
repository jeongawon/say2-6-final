"""
Layer 2 — DenseNet-121 ONNX 추론 (6-disease classification).

CheXpert 14-label 출력 중 ACTIVE_DISEASES 6개만 필터링하여 반환.
ImageNet 정규화 적용, sigmoid 후 질환별 Youden 임계값으로 판정.
"""

import os
import sys
import time

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from thresholds import ACTIVE_DISEASES, DENSENET_INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD


def _sigmoid(x: np.ndarray) -> np.ndarray:
    """Numerically stable sigmoid."""
    pos = x >= 0
    result = np.empty_like(x, dtype=np.float64)
    result[pos] = 1.0 / (1.0 + np.exp(-x[pos]))
    exp_x = np.exp(x[~pos])
    result[~pos] = exp_x / (1.0 + exp_x)
    return result


def _preprocess(pil_image: Image.Image) -> np.ndarray:
    """PIL Image -> (1, 3, 224, 224) float32, ImageNet normalized."""
    img = pil_image.resize((DENSENET_INPUT_SIZE[1], DENSENET_INPUT_SIZE[0]), Image.BILINEAR)
    arr = np.array(img, dtype=np.float32) / 255.0
    mean = np.array(IMAGENET_MEAN, dtype=np.float32)
    std = np.array(IMAGENET_STD, dtype=np.float32)
    arr = (arr - mean) / std
    arr = arr.transpose(2, 0, 1)
    return np.expand_dims(arr, axis=0).astype(np.float32)


def run_densenet(session, pil_image: Image.Image) -> dict:
    """
    DenseNet-121 추론 -> ACTIVE_DISEASES 6개 질환 결과.

    Returns:
        {
            "Cardiomegaly": {"probability": 0.89, "detected": True},
            "Pleural_Effusion": {"probability": 0.12, "detected": False},
            ...
            "_processing_time": 0.03
        }
    """
    t0 = time.time()
    input_arr = _preprocess(pil_image)
    logits = session.run(None, {"image": input_arr})[0]  # (1, 14)
    probs = _sigmoid(logits[0])  # (14,)

    results = {}
    for name, cfg in ACTIVE_DISEASES.items():
        prob = float(round(probs[cfg["index"]], 4))
        results[name] = {
            "probability": prob,
            "detected": prob > cfg["threshold"],
        }

    results["_processing_time"] = round(time.time() - t0, 4)
    return results
