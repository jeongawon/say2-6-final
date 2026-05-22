"""
Clinical Logic Engine — 6개 질환 DenseNet-UNet 교차검증.

DenseNet 확률 + UNet 해부학 측정값을 교차검증하여
최종 findings(detected, severity, verification) + risk_level 판정.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from thresholds import (
    ACTIVE_DISEASES,
    CTR_NORMAL_UPPER, CTR_MODERATE, CTR_SEVERE, CTR_BORDERLINE_LOWER,
    CP_ANGLE_BLUNTED, CP_ANGLE_SMALL, CP_ANGLE_MODERATE,
    LUNG_RATIO_PTX_SEVERE_LOW, LUNG_RATIO_PTX_SEVERE_HIGH,
    LUNG_RATIO_PTX_LOCATION_LEFT, LUNG_RATIO_PTX_LOCATION_RIGHT,
    LUNG_RATIO_ATEL_LOW, LUNG_RATIO_ATEL_HIGH,
    LUNG_RATIO_NORMAL_MIN, LUNG_RATIO_NORMAL_MAX,
    EDEMA_SEVERITY_SEVERE, EDEMA_SEVERITY_MODERATE,
    PTX_LARGE, PTX_MODERATE, PTX_SEG_ASSIST_THRESHOLD,
)


# ── MIMIC-style report constants ─────────────────────────────
ANATOMY_ORDER = ["cardiac", "mediastinum", "pulmonary", "pleural"]

DISEASE_ANATOMY = {
    "Cardiomegaly": "cardiac",
    "Enlarged_Cardiomediastinum": "mediastinum",
    "Edema": "pulmonary",
    "Atelectasis": "pulmonary",
    "Pleural_Effusion": "pleural",
    "Pneumothorax": "pleural",
}

SEVERITY_ADV = {"mild": "mildly", "moderate": "moderately", "severe": "severely"}

PERTINENT_NEGATIVES = ["Pneumothorax", "Enlarged_Cardiomediastinum"]

FINDINGS_TEMPLATES = {
    "Cardiomegaly": {
        True:  "The cardiac silhouette is {severity_adv} enlarged with a cardiothoracic ratio of {ctr:.2f}.",
        False: "The cardiac silhouette is within normal limits.",
    },
    "Enlarged_Cardiomediastinum": {
        True:  "The mediastinum appears {severity_adv} widened.",
        False: "No mediastinal widening is identified.",
    },
    "Edema": {
        True:  "{location_adj} pulmonary vascular congestion with signs of {severity} pulmonary edema is noted.",
        False: None,  # not a pertinent negative
    },
    "Atelectasis": {
        True:  "{location_detail}, suggestive of {differential}.",
        False: None,
    },
    "Pleural_Effusion": {
        True:  "{severity_cap} {location_detail} pleural effusion is observed.",
        False: None,
    },
    "Pneumothorax": {
        True:  "{severity_cap} {location_detail} pneumothorax is identified.",
        False: "No pneumothorax is identified.",
    },
}

DIFFERENTIAL_MAP = {
    "Atelectasis": {
        "threshold": 0.80,
        "high_conf_text": "atelectasis",
        "low_conf_text": "atelectasis versus pneumonia",
    },
    "Edema": {
        "threshold": 0.80,
        "high_conf_text": "pulmonary edema",
        "low_conf_text": "pulmonary edema versus fluid overload",
    },
    "Pleural_Effusion": {
        "threshold": 0.70,
        "high_conf_text": "pleural effusion",
        "low_conf_text": "pleural effusion versus hemothorax",
    },
}

RECOMMENDATION_MAP = {
    "Cardiomegaly": {
        "severe": "Urgent echocardiography recommended",
        "moderate": "Echocardiography recommended",
        "mild": "Follow-up radiograph recommended",
    },
    "Edema": {
        "severe": "Clinical correlation with BNP recommended",
        "moderate": "Clinical correlation with BNP recommended",
        "mild": None,
    },
    "Pneumothorax": {
        "critical": "Emergent needle decompression or chest tube placement",
        "severe": "Chest tube placement recommended",
        "moderate": "Chest tube placement may be considered",
        "mild": "Follow-up chest radiograph recommended",
    },
    "Atelectasis": {
        "_low_confidence": "Follow-up CT recommended if clinically indicated",
    },
    "Pleural_Effusion": {
        "severe": "Thoracentesis may be considered if clinically indicated",
    },
    "Enlarged_Cardiomediastinum": {
        "moderate": "CT evaluation may be considered",
        "mild": "CT evaluation may be considered",
    },
}


# ── 메인 함수 ────────────────────────────────────────────────
def _flatten_measurements(seg_result: dict) -> dict:
    """model.py의 nested measurements를 engine이 사용하는 flat dict로 변환."""
    raw = seg_result.get("measurements", {})
    cp = raw.get("cp_angle", {})
    trachea = raw.get("trachea", {})
    mediastinum = raw.get("mediastinum", {})
    diaphragm = raw.get("diaphragm", {})
    return {
        "ctr": raw.get("ctr", 0.0),
        "ctr_status": raw.get("ctr_status"),
        "heart_width_px": raw.get("heart_width_px", 0),
        "thorax_width_px": raw.get("thorax_width_px", 0),
        "lung_area_ratio": raw.get("lung_area_ratio", 1.0),
        "right_cp_status": cp.get("right", {}).get("status"),
        "left_cp_status": cp.get("left", {}).get("status"),
        "right_cp_angle_degrees": raw.get("cp_angle_right"),
        "left_cp_angle_degrees": raw.get("cp_angle_left"),
        "mediastinum_status": mediastinum.get("status"),
        "trachea_midline": trachea.get("midline"),
        "trachea_deviation_direction": trachea.get("deviation_direction"),
        "diaphragm_status": diaphragm.get("status"),
    }


def run_clinical_logic(densenet_result: dict, seg_result: dict) -> dict:
    """
    6개 질환 교차검증 + No_Finding + risk_level + summary.

    Args:
        densenet_result: run_densenet() 출력 (6개 질환 probability/detected)
        seg_result: run_segmentation() 출력 (measurements, view, ...)

    Returns:
        {"findings": [...], "risk_level": str, "summary": str}
    """
    m = _flatten_measurements(seg_result)
    view = seg_result.get("view", "PA")

    findings = []
    findings.append(_evaluate_cardiomegaly(densenet_result, m, view))
    findings.append(_evaluate_pleural_effusion(densenet_result, m))
    findings.append(_evaluate_edema(densenet_result, findings))
    findings.append(_evaluate_pneumothorax(densenet_result, m))
    findings.append(_evaluate_atelectasis(densenet_result, m))
    findings.append(_evaluate_enlarged_cm(densenet_result, m, findings))

    # No Finding
    any_detected = any(f["detected"] for f in findings)
    findings.append(_evaluate_no_finding(densenet_result, m, any_detected))

    risk_level = _determine_risk_level(findings, m)

    # ── MIMIC-style report generation ──
    for f in findings:
        if f["name"] == "No_Finding":
            continue
        f["impression_text"] = _generate_impression_text(f, m)

    findings_text = _generate_findings_text(findings, m)
    impression = _generate_impression(findings)
    rag_hints = _generate_rag_hints(findings)

    return {
        "findings": findings,
        "risk_level": risk_level,
        "summary": impression,          # backward compatible
        "findings_text": findings_text,
        "impression": impression,
        "rag_query_hints": rag_hints,
    }


# ── 1. Cardiomegaly — CTR 교차검증 ────────────────────────────
def _evaluate_cardiomegaly(dn: dict, m: dict, view: str) -> dict:
    d = dn.get("Cardiomegaly", {})
    prob = d.get("probability", 0.0)
    dn_detected = d.get("detected", False)
    ctr = m.get("ctr", 0.0)
    unet_confirmed = ctr > CTR_NORMAL_UPPER

    detected = dn_detected or unet_confirmed
    evidence = []
    severity = None
    recommendation = None

    if detected:
        if unet_confirmed:
            evidence.append(f"CTR {ctr:.4f} (>{CTR_NORMAL_UPPER})")
        if dn_detected:
            evidence.append(f"DenseNet {prob:.2f} (>0.55)")

        if ctr > CTR_SEVERE:
            severity = "severe"
            recommendation = "Urgent echocardiography recommended"
        elif ctr > CTR_MODERATE:
            severity = "moderate"
            recommendation = "Echocardiography recommended"
        else:
            severity = "mild"
            recommendation = "Follow-up radiograph recommended"

        # AP 뷰 보정: 심장이 확대되어 보이므로 severity 하향
        if view == "AP" and severity != "severe":
            evidence.append("AP view — possible cardiac magnification, severity adjusted")
            if severity == "moderate":
                severity = "mild"

    return _build_finding("Cardiomegaly", detected, prob, severity,
                          evidence, recommendation,
                          unet_metric="ctr", unet_value=ctr,
                          unet_threshold=CTR_NORMAL_UPPER,
                          unet_confirmed=unet_confirmed, dn_detected=dn_detected)


# ── 2. Pleural Effusion — CP angle 교차검증 ───────────────────
def _evaluate_pleural_effusion(dn: dict, m: dict) -> dict:
    d = dn.get("Pleural_Effusion", {})
    prob = d.get("probability", 0.0)
    dn_detected = d.get("detected", False)

    right_blunted = m.get("right_cp_status") == "blunted"
    left_blunted = m.get("left_cp_status") == "blunted"
    unet_confirmed = right_blunted or left_blunted

    detected = dn_detected or unet_confirmed
    evidence = []
    severity = None
    location = None
    recommendation = None

    if detected:
        if dn_detected:
            evidence.append(f"DenseNet {prob:.2f} (>0.51)")

        if right_blunted and left_blunted:
            location = "bilateral"
        elif right_blunted:
            location = "right"
        elif left_blunted:
            location = "left"

        # volume 추정 (CP angle 기반)
        max_vol = "small"
        for side, angle_key, status in [
            ("right", "right_cp_angle_degrees", right_blunted),
            ("left", "left_cp_angle_degrees", left_blunted),
        ]:
            if not status:
                continue
            angle = m.get(angle_key)
            if angle is None:
                continue
            if angle <= CP_ANGLE_SMALL:
                vol = "small"
                evidence.append(f"{side} CP angle {angle:.1f}° → small (~200-300mL)")
            elif angle <= CP_ANGLE_MODERATE:
                vol = "moderate"
                evidence.append(f"{side} CP angle {angle:.1f}° → moderate (~500mL)")
            else:
                vol = "large"
                evidence.append(f"{side} CP angle {angle:.1f}° → large (>1000mL)")
            vol_rank = {"small": 1, "moderate": 2, "large": 3}
            if vol_rank.get(vol, 0) > vol_rank.get(max_vol, 0):
                max_vol = vol

        severity = {"small": "mild", "moderate": "moderate", "large": "severe"}[max_vol]

        # bilateral이면 severity 한 단계 상향
        if location == "bilateral" and severity == "mild":
            severity = "moderate"
            evidence.append("Bilateral effusion — severity upgraded")

        if location == "bilateral" and m.get("ctr", 0) > CTR_NORMAL_UPPER:
            recommendation = "Echocardiography and BNP recommended"

    cp_value = {
        "left": m.get("left_cp_angle_degrees"),
        "right": m.get("right_cp_angle_degrees"),
    }

    return _build_finding("Pleural_Effusion", detected, prob, severity,
                          evidence, recommendation, location=location,
                          unet_metric="cp_angle", unet_value=cp_value,
                          unet_threshold=CP_ANGLE_BLUNTED,
                          unet_confirmed=unet_confirmed, dn_detected=dn_detected)


# ── 3. Edema — DenseNet 단독 + Cardiomegaly 동반 체크 ─────────
def _evaluate_edema(dn: dict, prior_findings: list) -> dict:
    d = dn.get("Edema", {})
    prob = d.get("probability", 0.0)
    detected = d.get("detected", False)

    evidence = []
    severity = None
    recommendation = None

    if detected:
        evidence.append(f"DenseNet {prob:.2f} (>0.67)")

        if prob > EDEMA_SEVERITY_SEVERE:
            severity = "severe"
        elif prob > EDEMA_SEVERITY_MODERATE:
            severity = "moderate"
        else:
            severity = "mild"

        # Cardiomegaly 동반 시 severity 상향 + CHF 추천
        cardio = next((f for f in prior_findings if f["name"] == "Cardiomegaly"), None)
        if cardio and cardio["detected"]:
            if severity == "mild":
                severity = "moderate"
            evidence.append("Concurrent cardiomegaly — severity upgraded")
            recommendation = "Clinical correlation with BNP recommended"

    return _build_finding("Edema", detected, prob, severity,
                          evidence, recommendation,
                          unet_metric=None, unet_value=None,
                          unet_threshold=None, unet_confirmed=None,
                          dn_detected=detected)


# ── 4. Pneumothorax — 폐면적비 + 기관편위 교차검증 ────────────
def _evaluate_pneumothorax(dn: dict, m: dict) -> dict:
    d = dn.get("Pneumothorax", {})
    prob = d.get("probability", 0.0)
    dn_detected = d.get("detected", False)

    ratio = m.get("lung_area_ratio", 1.0)
    # 완화된 기준: 0.70~1.30 밖이면 비대칭 (기존 0.60~1.67은 소량 기흉 놓침)
    moderate_asymmetry = (ratio < LUNG_RATIO_PTX_LOCATION_LEFT or ratio > LUNG_RATIO_PTX_LOCATION_RIGHT)
    severe_asymmetry = (ratio < LUNG_RATIO_PTX_SEVERE_LOW or ratio > LUNG_RATIO_PTX_SEVERE_HIGH)
    trachea_shifted = m.get("trachea_midline") is not None and not m.get("trachea_midline")

    detected = dn_detected
    evidence = []
    severity = None
    location = None
    recommendation = None
    alert = False

    # 세그 보조 검출: 폐면적 비대칭(완화 기준) + DenseNet 약양성
    if not detected and moderate_asymmetry and prob > PTX_SEG_ASSIST_THRESHOLD:
        detected = True
        evidence.append(f"Lung area ratio {ratio:.3f} asymmetry + DenseNet {prob:.2f} — pneumothorax suspected (segmentation-assisted)")

    if not detected:
        return _build_finding("Pneumothorax", False, prob, None, [], None,
                              unet_metric="lung_area_ratio", unet_value=ratio,
                              unet_threshold=LUNG_RATIO_PTX_SEVERE_LOW,
                              unet_confirmed=False, dn_detected=False)

    if dn_detected:
        evidence.append(f"DenseNet {prob:.2f} (>0.50)")

    # location 추정
    if ratio < LUNG_RATIO_PTX_LOCATION_LEFT:
        location = "left"
        evidence.append(f"Left lung volume loss (ratio {ratio:.3f})")
    elif ratio > LUNG_RATIO_PTX_LOCATION_RIGHT:
        location = "right"
        evidence.append(f"Right lung volume loss (ratio {ratio:.3f})")
    else:
        location = "indeterminate"

    # severity
    if prob > PTX_LARGE:
        severity = "severe"
    elif prob > PTX_MODERATE:
        severity = "moderate"
    else:
        severity = "mild"

    # Tension PTX: 기관편위 반대쪽
    dev_dir = m.get("trachea_deviation_direction")
    if trachea_shifted and (
        (location == "left" and dev_dir == "right") or
        (location == "right" and dev_dir == "left")
    ):
        severity = "critical"
        alert = True
        evidence.append(f"Tracheal deviation to {dev_dir} — TENSION PNEUMOTHORAX suspected")
        recommendation = "Emergent needle decompression or chest tube placement"
    elif severity == "severe":
        recommendation = "Chest tube placement recommended"
    elif severity == "moderate":
        recommendation = "Chest tube placement may be considered"
    else:
        recommendation = "Follow-up chest radiograph recommended"

    result = _build_finding("Pneumothorax", detected, prob, severity,
                            evidence, recommendation, location=location,
                            unet_metric="lung_area_ratio", unet_value=ratio,
                            unet_threshold=LUNG_RATIO_PTX_SEVERE_LOW,
                            unet_confirmed=severe_asymmetry, dn_detected=dn_detected)
    result["alert"] = alert
    return result


# ── 5. Atelectasis — 폐면적비 교차검증 ────────────────────────
def _evaluate_atelectasis(dn: dict, m: dict) -> dict:
    d = dn.get("Atelectasis", {})
    prob = d.get("probability", 0.0)
    dn_detected = d.get("detected", False)

    ratio = m.get("lung_area_ratio", 1.0)
    unet_confirmed = (ratio < LUNG_RATIO_ATEL_LOW or ratio > LUNG_RATIO_ATEL_HIGH)

    # DenseNet 필수 gate — UNet은 교차확인만 (FP 방지 우선)
    detected = dn_detected

    evidence = []
    severity = None
    location = None
    recommendation = None

    if detected:
        evidence.append(f"DenseNet {prob:.2f} (>0.50)")
        if unet_confirmed:
            if ratio < LUNG_RATIO_ATEL_LOW:
                location = "left"
                pct = round((1.0 - ratio) * 100)
                evidence.append(f"Left lung volume loss {pct}% (ratio {ratio:.3f})")
            else:
                location = "right"
                pct = round((ratio - 1.0) / ratio * 100)
                evidence.append(f"Right lung volume loss ~{pct}% (ratio {ratio:.3f})")

            # 기관편위 같은쪽 → 강한 무기폐
            trachea_dev = m.get("trachea_deviation_direction")
            if trachea_dev and trachea_dev == location:
                evidence.append(f"Tracheal deviation to {trachea_dev} (ipsilateral) — strong atelectasis sign")

            if pct > 40:
                severity = "severe"
            elif pct > 25:
                severity = "moderate"
            else:
                severity = "mild"
        else:
            severity = "mild"

        recommendation = "Clinical correlation recommended"

    return _build_finding("Atelectasis", detected, prob, severity,
                          evidence, recommendation, location=location,
                          unet_metric="lung_area_ratio", unet_value=ratio,
                          unet_threshold=LUNG_RATIO_ATEL_LOW,
                          unet_confirmed=unet_confirmed, dn_detected=dn_detected)


# ── 6. Enlarged Cardiomediastinum — 종격동 상태 교차검증 ──────
def _evaluate_enlarged_cm(dn: dict, m: dict, prior_findings: list) -> dict:
    d = dn.get("Enlarged_Cardiomediastinum", {})
    prob = d.get("probability", 0.0)
    dn_detected = d.get("detected", False)

    med_status = m.get("mediastinum_status")
    unet_confirmed = med_status == "widened"

    # DenseNet 필수 gate: UNet만 widened이어도 DenseNet 없으면 미탐지
    detected = dn_detected

    evidence = []
    severity = None
    recommendation = None

    if detected:
        evidence.append(f"DenseNet {prob:.2f} (>0.64)")
        if unet_confirmed:
            evidence.append("UNet mediastinum widened")

        if prob > 0.75:
            severity = "moderate"
        else:
            severity = "mild"

        # Cardiomegaly 동반 시 secondary 소견
        cardio = next((f for f in prior_findings if f["name"] == "Cardiomegaly"), None)
        if cardio and cardio["detected"]:
            evidence.append("Concurrent cardiomegaly — classified as associated finding")

        recommendation = "CT evaluation may be considered"

    return _build_finding("Enlarged_Cardiomediastinum", detected, prob, severity,
                          evidence, recommendation,
                          unet_metric="mediastinum_status", unet_value=med_status,
                          unet_threshold="widened",
                          unet_confirmed=unet_confirmed, dn_detected=dn_detected)


# ── 7. No Finding ─────────────────────────────────────────────
def _evaluate_no_finding(dn: dict, m: dict, any_detected: bool) -> dict:
    detected = not any_detected
    evidence = []
    confidence = 0.0

    if detected:
        ctr = m.get("ctr", 0.0)
        borderline = []
        if CTR_BORDERLINE_LOWER <= ctr < CTR_NORMAL_UPPER:
            borderline.append(f"CTR {ctr:.4f} (borderline)")

        for name, cfg in ACTIVE_DISEASES.items():
            prob = dn.get(name, {}).get("probability", 0.0)
            thresh = cfg["threshold"]
            if prob > thresh * 0.7 and prob <= thresh:
                borderline.append(f"{name} {prob:.2f}/{thresh:.2f}")

        if borderline:
            evidence.append(f"Borderline findings: {', '.join(borderline)}")
            confidence = 0.7
        else:
            evidence.append("All 6 diseases negative, no significant findings")
            confidence = 0.95
    else:
        confidence = 0.0

    return {
        "name": "No_Finding",
        "detected": detected,
        "confidence": confidence,
        "severity": None,
        "verification": None,
        "evidence": evidence,
        "location": None,
        "recommendation": None,
        "impression_text": "No acute cardiopulmonary abnormality" if detected else None,
    }


# ── risk_level 판정 ───────────────────────────────────────────
def _determine_risk_level(findings: list, m: dict) -> str:
    ptx = next((f for f in findings if f["name"] == "Pneumothorax"), None)
    cardio = next((f for f in findings if f["name"] == "Cardiomegaly"), None)
    edema = next((f for f in findings if f["name"] == "Edema"), None)
    effusion = next((f for f in findings if f["name"] == "Pleural_Effusion"), None)

    # critical
    if ptx and ptx.get("alert"):
        return "critical"
    if (cardio and cardio["detected"] and cardio.get("severity") == "severe"
            and edema and edema["detected"]):
        return "critical"

    # urgent
    if ptx and ptx["detected"]:
        return "urgent"
    if cardio and cardio["detected"] and cardio.get("severity") == "severe":
        return "urgent"
    if edema and edema["detected"] and edema.get("severity") == "severe":
        return "urgent"
    if effusion and effusion["detected"] and effusion.get("severity") == "severe":
        return "urgent"

    return "routine"


# ── MIMIC-style report generation ────────────────────────────

def _get_differential(disease: str, probability: float) -> str:
    """Low-confidence findings get differential diagnosis text."""
    if disease in DIFFERENTIAL_MAP:
        info = DIFFERENTIAL_MAP[disease]
        if probability < info["threshold"]:
            return info["low_conf_text"]
        return info["high_conf_text"]
    return disease.lower().replace("_", " ")


def _describe_location(finding: dict, m: dict) -> str:
    """UNet measurements → detailed location text."""
    name = finding["name"]
    location = finding.get("location")
    ratio = m.get("lung_area_ratio", 1.0)

    if name == "Pleural_Effusion":
        if location == "bilateral":
            # compare left vs right CP angles to determine dominance
            left_a = m.get("left_cp_angle_degrees") or 999
            right_a = m.get("right_cp_angle_degrees") or 999
            if left_a < right_a * 0.7:
                return "bilateral, left greater than right"
            elif right_a < left_a * 0.7:
                return "bilateral, right greater than left"
            return "bilateral"
        return f"{location}-sided" if location else ""

    if name == "Atelectasis":
        side = location or ("right" if ratio > 1.0 else "left")
        trachea_dev = m.get("trachea_deviation_direction")
        if trachea_dev and trachea_dev == side:
            return f"{side.capitalize()}-sided volume loss with ipsilateral tracheal deviation"
        return f"{side.capitalize()} basilar opacity"

    if name == "Pneumothorax":
        side = location or "indeterminate"
        if side == "indeterminate":
            return ""
        return f"{side}-sided"

    if name == "Edema":
        return "Bilateral perihilar"

    return ""


def _generate_impression_text(finding: dict, m: dict) -> str:
    """Generate single-line impression text for one finding."""
    name = finding["name"]
    detected = finding["detected"]
    severity = finding.get("severity")
    prob = finding.get("confidence", 0.0)

    if not detected:
        return f"No {name.lower().replace('_', ' ')}"

    parts = []
    if severity:
        parts.append(severity.capitalize())

    disease_text = _get_differential(name, prob)
    parts.append(disease_text)

    loc = _describe_location(finding, m)
    if loc and loc not in ["Bilateral perihilar"]:
        parts.append(f"({loc})")

    # measurement annotation
    v = finding.get("verification") or {}
    if v.get("unet_metric") == "ctr" and v.get("unet_value"):
        parts.append(f"(CTR {v['unet_value']:.2f})")

    return " ".join(parts)


def _generate_findings_text(findings: list, m: dict) -> str:
    """Generate MIMIC-style FINDINGS paragraph in anatomical order."""
    sentences = []

    # group by anatomy
    by_anatomy = {}
    for f in findings:
        if f["name"] == "No_Finding":
            continue
        anat = DISEASE_ANATOMY.get(f["name"], "other")
        by_anatomy.setdefault(anat, []).append(f)

    for anat in ANATOMY_ORDER:
        for f in by_anatomy.get(anat, []):
            name = f["name"]
            detected = f["detected"]
            template_pair = FINDINGS_TEMPLATES.get(name, {})
            template = template_pair.get(detected)

            if template is None:
                # not a pertinent negative and not detected → skip
                if not detected:
                    continue
                continue

            if not detected:
                sentences.append(template)
                continue

            severity = f.get("severity", "mild")
            severity_adv = SEVERITY_ADV.get(severity, severity)
            prob = f.get("confidence", 0.0)
            loc_detail = _describe_location(f, m)

            v = f.get("verification") or {}
            ctr = v.get("unet_value") if v.get("unet_metric") == "ctr" else 0.0
            if isinstance(ctr, dict):
                ctr = 0.0

            try:
                sentence = template.format(
                    severity=severity,
                    severity_adv=severity_adv,
                    severity_cap=severity.capitalize() if severity else "",
                    ctr=ctr or 0.0,
                    location_adj=loc_detail or "Bilateral",
                    location_detail=loc_detail or "",
                    differential=_get_differential(name, prob),
                    differential_text=_get_differential(name, prob),
                )
                # clean double spaces
                sentence = " ".join(sentence.split())
            except (KeyError, IndexError):
                sentence = f"{severity.capitalize()} {name.lower().replace('_', ' ')} identified."

            sentences.append(sentence)

    return " ".join(sentences) if sentences else "No significant findings."


def _generate_impression(findings: list) -> str:
    """Generate MIMIC-style numbered IMPRESSION list."""
    detected = [f for f in findings
                if f["detected"] and f["name"] != "No_Finding"]
    not_detected = [f for f in findings
                    if not f["detected"] and f["name"] in PERTINENT_NEGATIVES]

    if not detected and not not_detected:
        return "No significant findings."

    # sort detected by severity (severe > moderate > mild)
    sev_rank = {"critical": 4, "severe": 3, "moderate": 2, "mild": 1}
    detected.sort(key=lambda f: sev_rank.get(f.get("severity", ""), 0), reverse=True)

    lines = []
    idx = 1

    for f in detected:
        text = f.get("impression_text", f["name"])
        rec = f.get("recommendation")
        line = f"{idx}. {text}."
        if rec:
            line += f" {rec}."
        lines.append(line)
        idx += 1

    for f in not_detected:
        neg_text = f.get("impression_text", f"No {f['name'].lower().replace('_', ' ')}")
        lines.append(f"{idx}. {neg_text}.")
        idx += 1

    return "\n".join(lines)


def _generate_rag_hints(findings: list) -> list:
    """Generate RAG search query hints from detected findings."""
    hints = []
    for f in findings:
        if not f["detected"] or f["name"] == "No_Finding":
            continue
        keyword = f["name"].lower().replace("_", " ")
        severity = f.get("severity", "")
        query = f"{severity} {keyword}".strip()

        v = f.get("verification") or {}
        if v.get("unet_metric") == "ctr" and isinstance(v.get("unet_value"), (int, float)):
            query += f" ctr {v['unet_value']:.2f}"

        hints.append(query)
    return hints


# ── 유틸리티: finding 구조 빌더 ───────────────────────────────
def _build_finding(name, detected, confidence, severity, evidence,
                   recommendation, location=None,
                   unet_metric=None, unet_value=None,
                   unet_threshold=None, unet_confirmed=None,
                   dn_detected=False):
    verification = None
    if unet_metric is not None:
        verification = {
            "densenet": dn_detected,
            "unet_metric": unet_metric,
            "unet_value": unet_value,
            "unet_threshold": unet_threshold,
            "unet_confirmed": unet_confirmed,
        }

    return {
        "name": name,
        "detected": detected,
        "confidence": confidence,
        "severity": severity,
        "verification": verification,
        "evidence": evidence,
        "location": location,
        "recommendation": recommendation,
    }
