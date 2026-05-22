"""
central_final_opinion_builder.py

Central Orchestrator에서 최종 Bedrock 소견 생성을 담당하는 유틸 파일.

역할:
- ECG / CXR / LAB 결과 + RAG Top-K 결과를 최종 프롬프트로 조립
- RAG fallback 여부를 반영
- Haiku / Sonnet 모델 라우팅
- Bedrock Claude Messages API body 생성
- 선택적으로 Bedrock 호출까지 수행
- Claude 응답을 병원 소견서 필수 섹션 형식으로 후처리

중요:
- 이 파일은 RAG 검색용 query 생성기가 아니다.
- RAG 검색용 query는 rag_retrieval_query_builder.py 또는 retrieval_query_builder.py에서 만든다.
- 이 파일은 RAG가 반환한 Top-K 근거와 모달 결과를 합쳐 "최종 소견"을 만들기 위한 중앙용 모듈이다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal
import json
import os
import re
import time


# ──────────────────────────────────────────────
# 모델 설정
# ──────────────────────────────────────────────

LLM_MODEL_HAIKU = os.environ.get(
    "LLM_MODEL_HAIKU",
    "anthropic.claude-3-haiku-20240307-v1:0",
)

LLM_MODEL_SONNET = os.environ.get(
    "LLM_MODEL_SONNET",
    "us.anthropic.claude-sonnet-4-20250514-v1:0",
)

# 병원 소견서 양식은 섹션이 많으므로 기본 max_tokens를 4096으로 둔다.
LLM_MAX_TOKENS = int(os.environ.get("LLM_MAX_TOKENS", "4096"))
LLM_TEMPERATURE = float(os.environ.get("LLM_TEMPERATURE", "0.2"))


# ──────────────────────────────────────────────
# 최종 소견 SYSTEM PROMPT
# ──────────────────────────────────────────────

CENTRAL_FINAL_SYSTEM_PROMPT = """
당신은 응급실 임상 의사결정을 보조하는 의료 AI 시스템입니다.
현재 환자의 ECG/CXR/LAB 분석 결과와 RAG가 반환한 과거 유사 환자 사례를 근거로,
의료진 참고용 응급실 소견서를 작성하십시오.

반드시 지켜야 할 원칙:
1. 제공된 정보에 근거해서만 작성하십시오.
2. 없는 검사 결과를 정상으로 간주하지 마십시오.
3. '검사 미시행', '기록 없음', '판독 불가', '품질 불량'은 정상 소견이 아니라 데이터 제한으로 분류하십시오.
4. RAG 과거 유사 사례는 현재 환자의 비정상 소견을 해석하는 참고 근거로만 사용하십시오.
5. 현재 환자에게 없는 이상소견을 과거 사례에서 가져와 단정하지 마십시오.
6. 구체적인 수치, 병변 위치, 시간 변화가 제공된 경우 반드시 포함하십시오.
7. 불확실한 경우에는 단정하지 말고 "가능성", "감별 필요", "추가 확인 필요"로 표현하십시오.
8. 최종 진단처럼 단정하지 말고 의료진 참고용 보조 소견으로 작성하십시오.
9. 제공되지 않은 환자 식별 정보, 과거력, 진찰 소견은 임의 생성하지 말고 "제공된 정보 없음"이라고 작성하십시오.

출력 형식:
반드시 아래 양식을 유지하십시오.

[병원 로고 / 환자 식별 정보]
환자명 | 등록번호 | 생년월일/성별 | 진료일자

────────────────────────────────────────
상기 인은 YYYY. MM. DD 본원 응급실에 내원하여 시행한
검사 및 진찰 결과 다음과 같이 소견드립니다.

[주증상 / Chief Complaint]
  - OO을 주소로 내원

[현병력 / Present Illness]
  - 발병 시점, 경과, 동반 증상 한 단락

[과거력 / Past History]
  - HTN(+), DM(+), CKD(+) 등
  - 정보가 없으면 "제공된 정보 없음"이라고 작성

[진찰 소견 / Physical Exam]
  - V/S: BP/HR/RR/BT/SpO2
  - 의식, 청진, 압통 등
  - 정보가 없으면 "제공된 정보 없음"이라고 작성

[검사 소견 / Investigation]
  - LAB: 비정상 수치 중심
  - ECG: 핵심 판독 1~2줄
  - Imaging/CXR: 핵심 판독 1~2줄

[RAG 참고 근거 / Similar Case Reference]
  - 유사 과거 사례와의 공통점
  - 차이점 또는 제한점
  - fallback인 경우 "충분히 유사한 과거 사례 근거가 제한적임"이라고 명시

[진단명 / Impression]
  - 1. 주진단
  - 2. 부진단 / 감별진단 / 동반질환

[치료 계획 / Plan]
  - 1. 시급 처치
  - 2. 모니터링
  - 3. 협진 / 추가검사
  - 4. 재내원 또는 악화 기준

────────────────────────────────────────
※ 본 소견서는 진료 시점의 임상 판단에 의한 것이며,
  최종 진단은 추가 검사 결과에 따라 변경될 수 있습니다.

진료의 ○○○ (면허번호 #####)  /  YYYY. MM. DD
""".strip()


FALLBACK_RAG_CONTEXT = """
[RAG 참고 근거 / Similar Case Reference]
충분히 유사한 과거 환자 사례를 찾지 못했습니다.
따라서 최종 소견은 현재 환자의 ECG/CXR/LAB 결과를 중심으로 작성해야 하며,
[RAG 참고 근거 / Similar Case Reference] 섹션에는 유사 사례 근거 제한을 명시해야 합니다.
""".strip()


# ──────────────────────────────────────────────
# 데이터 구조
# ──────────────────────────────────────────────

@dataclass
class FinalPromptPackage:
    """Bedrock 최종 호출 직전에 중앙에서 생성하는 프롬프트 패키지."""

    system_prompt: str
    user_prompt: str
    selected_model: str
    selected_model_reason: str
    rag_fallback: bool
    warnings: list[str] = field(default_factory=list)

    def to_bedrock_body(self) -> dict[str, Any]:
        """Claude Messages API body dict."""
        return {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": LLM_MAX_TOKENS,
            "temperature": LLM_TEMPERATURE,
            "system": self.system_prompt,
            "messages": [
                {
                    "role": "user",
                    "content": self.user_prompt,
                }
            ],
        }


@dataclass
class FinalOpinionResult:
    """최종 Bedrock 응답 후처리 결과."""

    text: str
    valid_required_sections: bool
    missing_sections: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


# ──────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────

def build_final_prompt_package(
    *,
    patient_summary: str | None = None,
    modal_results: dict[str, Any] | None = None,
    rag_response: dict[str, Any] | None = None,
    chief_complaint: str | None = None,
    vitals: str | dict[str, Any] | None = None,
    additional_context: str | dict[str, Any] | None = None,
    force_model: Literal["haiku", "sonnet"] | str | None = None,
) -> FinalPromptPackage:
    """
    중앙 Orchestrator에서 최종 Bedrock 호출 직전에 사용할 프롬프트 패키지를 생성한다.
    """
    warnings: list[str] = []

    current_patient_block = build_current_patient_block(
        patient_summary=patient_summary,
        chief_complaint=chief_complaint,
        vitals=vitals,
        modal_results=modal_results,
        additional_context=additional_context,
    )

    rag_context, rag_fallback, rag_meta = build_rag_context(rag_response)

    user_prompt = (
        "[현재 환자 정보 및 모달 분석 결과]\n"
        f"{current_patient_block}\n\n"
        "[과거 유사 환자 사례 근거]\n"
        f"{rag_context}\n\n"
        "[작성 지시]\n"
        "위 정보를 근거로 의료진 참고용 응급실 소견서를 작성하십시오.\n"
        "반드시 system prompt에 제시된 병원 소견서 양식을 유지하십시오.\n"
        "현재 환자의 실제 검사 결과와 RAG 과거 유사 사례 근거를 명확히 구분하십시오."
    ).strip()

    selected_model, reason = select_final_model(
        modal_results=modal_results,
        rag_response=rag_response,
        current_patient_text=current_patient_block,
        force_model=force_model,
    )

    if rag_fallback:
        warnings.append("RAG fallback=true: final opinion should rely mainly on current modal results.")

    if not current_patient_block.strip():
        warnings.append("current patient block is empty or nearly empty.")

    return FinalPromptPackage(
        system_prompt=CENTRAL_FINAL_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        selected_model=selected_model,
        selected_model_reason=reason,
        rag_fallback=rag_fallback,
        warnings=warnings + rag_meta.get("warnings", []),
    )


def build_bedrock_body(package: FinalPromptPackage) -> str:
    """Bedrock invoke_model에 넣을 JSON string body."""
    return json.dumps(package.to_bedrock_body(), ensure_ascii=False)


def invoke_bedrock_final_opinion(
    package: FinalPromptPackage,
    *,
    bedrock_client: Any | None = None,
    max_retries: int = 3,
) -> FinalOpinionResult:
    """
    Bedrock Claude 모델을 호출하고 최종 소견을 후처리한다.

    Central Orchestrator Task Role에 bedrock:InvokeModel 권한이 있어야 한다.
    """
    if bedrock_client is None:
        import boto3
        bedrock_client = boto3.client("bedrock-runtime")

    body = build_bedrock_body(package)

    last_error: Exception | None = None

    for attempt in range(1, max_retries + 1):
        try:
            response = bedrock_client.invoke_model(
                modelId=package.selected_model,
                contentType="application/json",
                accept="application/json",
                body=body,
            )
            payload = json.loads(response["body"].read())
            raw_text = extract_claude_text(payload)
            return postprocess_final_opinion(raw_text)

        except Exception as exc:
            last_error = exc
            if attempt < max_retries:
                time.sleep(2 ** attempt)

    return FinalOpinionResult(
        text=f"[에러] Bedrock 최종 소견 생성 실패: {type(last_error).__name__}: {last_error}",
        valid_required_sections=False,
        missing_sections=REQUIRED_SECTION_TITLES.copy(),
        warnings=["bedrock invocation failed"],
    )


# ──────────────────────────────────────────────
# 현재 환자 블록 생성
# ──────────────────────────────────────────────

def build_current_patient_block(
    *,
    patient_summary: str | None = None,
    chief_complaint: str | None = None,
    vitals: str | dict[str, Any] | None = None,
    modal_results: dict[str, Any] | None = None,
    additional_context: str | dict[str, Any] | None = None,
) -> str:
    """현재 환자의 전체 모달 결과를 최종 프롬프트에 넣기 좋게 정리한다."""
    sections: list[tuple[str, str]] = []

    if patient_summary:
        sections.append(("PATIENT_SUMMARY", _normalize_any(patient_summary)))

    if chief_complaint:
        sections.append(("CHIEF_COMPLAINT", _normalize_any(chief_complaint)))

    if vitals:
        sections.append(("VITALS", _normalize_any(vitals)))

    if additional_context:
        sections.append(("ADDITIONAL_CONTEXT", _normalize_any(additional_context)))

    if modal_results:
        for modality in ["cxr", "lab", "ecg"]:
            value = _get_case_insensitive(modal_results, modality)
            if value:
                sections.append((modality.upper(), _format_modality_value(modality, value)))

        handled = {"cxr", "lab", "ecg"}
        for key, value in modal_results.items():
            if key.lower() not in handled and value:
                sections.append((key.upper(), _format_modality_value(key, value)))

    return _join_sections(sections)


def _format_modality_value(modality: str, value: Any) -> str:
    """
    모달 결과를 study_id/time 라벨을 보존하면서 문자열화한다.
    최종 프롬프트용이므로 정보 보존을 우선한다.
    """
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        if "text" in value or "result" in value or "summary" in value:
            study_id = value.get("study_id") or value.get("id") or f"{modality}-1"
            text = value.get("text") or value.get("result") or value.get("summary") or ""
            time_value = value.get("time") or value.get("timestamp") or value.get("date")
            prefix = f"- {study_id}"
            if time_value:
                prefix += f" ({time_value})"
            return f"{prefix}: {str(text).strip()}"

        return "\n".join(f"- {k}: {_normalize_any(v)}" for k, v in value.items())

    if isinstance(value, list):
        parts = []
        for idx, item in enumerate(value, 1):
            if isinstance(item, dict):
                study_id = item.get("study_id") or item.get("id") or f"{modality}-{idx}"
                text = item.get("text") or item.get("result") or item.get("summary") or _normalize_any(item)
                time_value = item.get("time") or item.get("timestamp") or item.get("date")
                prefix = f"- {study_id}"
                if time_value:
                    prefix += f" ({time_value})"
                parts.append(f"{prefix}: {str(text).strip()}")
            else:
                parts.append(f"- {modality}-{idx}: {str(item).strip()}")
        return "\n".join(parts)

    return str(value).strip()


# ──────────────────────────────────────────────
# RAG context 생성
# ──────────────────────────────────────────────

def build_rag_context(rag_response: dict[str, Any] | None) -> tuple[str, bool, dict[str, Any]]:
    """
    RAG API 응답을 최종 프롬프트에 넣을 근거 블록으로 변환한다.

    Returns
    -------
    (rag_context, fallback, meta)
    """
    meta = {"warnings": []}

    if not rag_response:
        meta["warnings"].append("rag_response is missing")
        return FALLBACK_RAG_CONTEXT, True, meta

    fallback = bool(rag_response.get("fallback", False))
    results = rag_response.get("results") or rag_response.get("top_k") or []

    if fallback or not results:
        return FALLBACK_RAG_CONTEXT, True, meta

    context_parts = []

    for idx, item in enumerate(results, 1):
        document = str(item.get("document") or item.get("summary") or "").strip()
        metadata = item.get("metadata") or {}
        similarity = item.get("similarity")

        chunk_type = metadata.get("chunk_type") or item.get("chunk_type") or "unknown"
        hadm_id = metadata.get("hadm_id") or item.get("hadm_id") or "unknown"
        case_id = item.get("id") or item.get("case_ref") or f"case-{idx}"

        if not document:
            meta["warnings"].append(f"RAG result {idx} has no document text.")
            continue

        sim_text = f"{similarity}" if similarity is not None else "unknown"

        context_parts.append(
            f"[유사 사례 {idx}]\n"
            f"- case_id: {case_id}\n"
            f"- 유형: {chunk_type}\n"
            f"- 입원번호/참조 ID: {hadm_id}\n"
            f"- 유사도: {sim_text}\n"
            f"- 내용:\n{document}"
        )

    if not context_parts:
        meta["warnings"].append("RAG results exist but no usable document text.")
        return FALLBACK_RAG_CONTEXT, True, meta

    return "\n\n".join(context_parts), False, meta


# ──────────────────────────────────────────────
# Critical Signal Detection
# ──────────────────────────────────────────────

HARD_CRITICAL_PATTERNS = [
    # arrest / resuscitation
    r"\bcardiac arrest\b",
    r"\bcode blue\b",
    r"\bcpr\b",
    r"\brosc\b",
    r"심정지",
    r"심폐소생술",
    r"소생술",

    # shock
    r"\bseptic shock\b",
    r"\bcardiogenic shock\b",
    r"\bhypovolemic shock\b",
    r"\bhemorrhagic shock\b",
    r"\bshock\b",
    r"패혈성\s*쇼크",
    r"심인성\s*쇼크",
    r"저혈량성\s*쇼크",
    r"출혈성\s*쇼크",
    r"쇼크",

    # respiratory failure / airway
    r"\bacute respiratory failure\b",
    r"\brespiratory failure\b",
    r"\bintubation\b",
    r"\bmechanical ventilation\b",
    r"\bventilator\b",
    r"급성\s*호흡부전",
    r"호흡부전",
    r"삽관",
    r"기계환기",

    # high-risk cardiac
    r"\bstemi\b",
    r"\bst elevation myocardial infarction\b",
    r"\bventricular fibrillation\b",
    r"\bventricular tachycardia\b",
    r"\bvf\b",
    r"\bvt\b",
    r"심실세동",
    r"심실빈맥",

    # severe infection
    r"\bsevere sepsis\b",
    r"중증\s*패혈증",

    # massive bleeding / trauma
    r"\bmassive bleeding\b",
    r"\bmassive hemorrhage\b",
    r"\btrauma activation\b",
    r"대량\s*출혈",
    r"중증\s*외상",

    # ICU / urgent intervention
    r"\bicu admission\b",
    r"\burgent surgery\b",
    r"\bemergency surgery\b",
    r"\bvasopressor\b",
    r"\bnorepinephrine\b",
    r"\bepinephrine\b",
    r"중환자실",
    r"응급\s*수술",
    r"승압제",
]

_COMPILED_CRITICAL_PATTERNS = [
    re.compile(pattern, re.IGNORECASE)
    for pattern in HARD_CRITICAL_PATTERNS
]


def has_numeric_critical_signal(text: str) -> tuple[bool, str | None]:
    """수치 기반 critical signal 감지."""

    # Lactate >= 4.0 (lactate clearance 제외)
    lactate_patterns = [
        r"\blactate\b(?!\s*clearance)\s*(?:level|=|:|is|was|of)?\s*(\d+(?:\.\d+)?)\s*(?:mmol/l|mmol|mg/dl|mg)?",
        r"\b젖산\s*(?:수치|=|:)?\s*(\d+(?:\.\d+)?)",
    ]
    for pattern in lactate_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = _safe_float(match.group(1))
            if value is not None and value >= 4.0:
                return True, f"critical lactate >= 4.0: {value}"

    # SpO2 < 90
    spo2_patterns = [
        r"\bspo2\b\s*(?:=|:)?\s*(\d{2,3})\s*%?",
        r"\bo2\s*sat(?:uration)?\b\s*(?:=|:)?\s*(\d{2,3})\s*%?",
        r"산소포화도\s*(?:=|:)?\s*(\d{2,3})\s*%?",
    ]
    for pattern in spo2_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = _safe_float(match.group(1))
            if value is not None and value < 90:
                return True, f"critical SpO2 < 90: {value}"

    # SBP < 90
    sbp_patterns = [
        r"\b(?:sbp|systolic bp|systolic blood pressure)\b\s*(?:=|:)?\s*(\d{2,3})",
        r"수축기\s*혈압\s*(?:=|:)?\s*(\d{2,3})",
    ]
    for pattern in sbp_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = _safe_float(match.group(1))
            if value is not None and value < 90:
                return True, f"critical SBP < 90: {value}"

    # MAP < 65
    map_patterns = [
        r"\b(?:map|mean arterial pressure)\b\s*(?:=|:)?\s*(\d{2,3})",
        r"평균\s*동맥압\s*(?:=|:)?\s*(\d{2,3})",
    ]
    for pattern in map_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = _safe_float(match.group(1))
            if value is not None and value < 65:
                return True, f"critical MAP < 65: {value}"

    # HR > 150
    hr_patterns = [
        r"\b(?:hr|heart rate)\b\s*(?:=|:)?\s*(\d{2,3})",
        r"심박수\s*(?:=|:)?\s*(\d{2,3})",
    ]
    for pattern in hr_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = _safe_float(match.group(1))
            if value is not None and value > 150:
                return True, f"critical HR > 150: {value}"

    # RR > 30
    rr_patterns = [
        r"\b(?:rr|respiratory rate)\b\s*(?:=|:)?\s*(\d{1,3})",
        r"호흡수\s*(?:=|:)?\s*(\d{1,3})",
    ]
    for pattern in rr_patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            value = _safe_float(match.group(1))
            if value is not None and value > 30:
                return True, f"critical RR > 30: {value}"

    return False, None


def _is_negated_near_match(text: str, start: int, window: int = 25) -> bool:
    """match 위치 앞에 부정어가 있는지 확인한다."""
    prefix = text[max(0, start - window):start].lower()
    negation_patterns = [
        r"\bno\b",
        r"\bnot\b",
        r"\bwithout\b",
        r"\bdenies\b",
        r"없음",
        r"아님",
        r"부정",
        r"필요\s*없",
    ]
    return any(re.search(p, prefix, flags=re.IGNORECASE) for p in negation_patterns)


def has_critical_signal(text: str) -> tuple[bool, str | None]:
    """Hard critical phrase + numeric signal 통합 판단."""
    for pattern in _COMPILED_CRITICAL_PATTERNS:
        match = pattern.search(text)
        if match:
            if _is_negated_near_match(text, match.start()):
                return True, f"critical phrase matched with negation context: {pattern.pattern}"
            return True, f"critical phrase matched: {pattern.pattern}"

    numeric_hit, numeric_reason = has_numeric_critical_signal(text)
    if numeric_hit:
        return True, numeric_reason

    return False, None


# ──────────────────────────────────────────────
# 모델 라우팅
# ──────────────────────────────────────────────

def select_final_model(
    *,
    modal_results: dict[str, Any] | None = None,
    rag_response: dict[str, Any] | None = None,
    current_patient_text: str = "",
    force_model: Literal["haiku", "sonnet"] | str | None = None,
) -> tuple[str, str]:
    """
    최종 소견 생성 모델을 선택한다.

    Sonnet 조건 (전체의 ~10~15%만):
    1. Hard critical phrase 또는 numeric critical signal
    2. RAG fallback
    3. RAG top similarity < 0.25

    나머지는 비용 절감을 위해 Haiku를 기본 사용한다.
    """
    if force_model:
        lowered = str(force_model).lower()
        if lowered == "haiku":
            return LLM_MODEL_HAIKU, "forced: haiku"
        if lowered == "sonnet":
            return LLM_MODEL_SONNET, "forced: sonnet"
        return str(force_model), "forced: explicit model id"

    all_text = (
        current_patient_text + "\n" +
        _normalize_any(modal_results or {}) + "\n" +
        _normalize_any(rag_response or {})
    )

    is_critical, critical_reason = has_critical_signal(all_text)
    if is_critical:
        return LLM_MODEL_SONNET, critical_reason or "critical signal detected"

    rag_fallback = bool((rag_response or {}).get("fallback", False))
    if rag_fallback:
        return LLM_MODEL_SONNET, "RAG fallback: no reliable similar cases"

    results = (rag_response or {}).get("results") or (rag_response or {}).get("top_k") or []
    if results:
        top_similarity = _safe_float(results[0].get("similarity"))
        if top_similarity is not None and top_similarity < 0.25:
            return LLM_MODEL_SONNET, f"very low top similarity: {top_similarity}"

    return LLM_MODEL_HAIKU, "default: cost-optimized haiku"


# ──────────────────────────────────────────────
# 후처리
# ──────────────────────────────────────────────

REQUIRED_SECTION_TITLES = [
    "주증상 / Chief Complaint",
    "현병력 / Present Illness",
    "과거력 / Past History",
    "진찰 소견 / Physical Exam",
    "검사 소견 / Investigation",
    "RAG 참고 근거 / Similar Case Reference",
    "진단명 / Impression",
    "치료 계획 / Plan",
]

REQUIRED_SECTION_ALIASES = {
    "주증상 / Chief Complaint": ["주증상", "Chief Complaint"],
    "현병력 / Present Illness": ["현병력", "Present Illness"],
    "과거력 / Past History": ["과거력", "Past History"],
    "진찰 소견 / Physical Exam": ["진찰 소견", "Physical Exam"],
    "검사 소견 / Investigation": ["검사 소견", "Investigation"],
    "RAG 참고 근거 / Similar Case Reference": [
        "RAG 참고 근거",
        "Similar Case Reference",
        "유사 사례",
        "과거 유사 사례",
    ],
    "진단명 / Impression": ["진단명", "Impression"],
    "치료 계획 / Plan": ["치료 계획", "Plan"],
}


def postprocess_final_opinion(raw_text: str) -> FinalOpinionResult:
    """
    Claude 응답을 중앙 시스템에서 저장/반환하기 전 정리한다.

    수행:
    - 공백 정리
    - 코드블록 제거
    - 필수 소견서 섹션 존재 여부 확인
    - 누락 섹션이 있으면 경고와 함께 최소 섹션 헤더를 보강
    """
    warnings: list[str] = []

    text = _clean_model_output(raw_text)

    missing = detect_missing_sections(text)
    valid = len(missing) == 0

    if missing:
        warnings.append(f"missing required sections: {', '.join(missing)}")
        text = repair_missing_section_headers(text, missing)

    return FinalOpinionResult(
        text=text,
        valid_required_sections=valid,
        missing_sections=missing,
        warnings=warnings,
    )


def detect_missing_sections(text: str) -> list[str]:
    missing = []
    compact_text = re.sub(r"\s+", "", text)

    for canonical_title, aliases in REQUIRED_SECTION_ALIASES.items():
        found = False

        for alias in [canonical_title] + aliases:
            compact_alias = re.sub(r"\s+", "", alias)

            if compact_alias in compact_text:
                found = True
                break

        if not found:
            missing.append(canonical_title)

    return missing


def repair_missing_section_headers(text: str, missing: list[str]) -> str:
    if not missing:
        return text

    additions = []
    for title in missing:
        additions.append(
            f"[{title}]\n"
            f"  - 해당 항목은 모델 응답에서 명확히 분리되지 않았습니다. "
            f"제공된 원문 결과를 검토해 보완이 필요합니다."
        )

    return text.rstrip() + "\n\n[형식 보완 필요]\n" + "\n\n".join(additions)


def extract_claude_text(payload: dict[str, Any]) -> str:
    """Bedrock Claude Messages API 응답에서 text를 추출한다."""
    content = payload.get("content")

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") in (None, "text"):
                text = item.get("text")
                if text:
                    parts.append(text)
        if parts:
            return "\n".join(parts).strip()

    if "completion" in payload:
        return str(payload["completion"]).strip()

    return json.dumps(payload, ensure_ascii=False)


# ──────────────────────────────────────────────
# 유틸
# ──────────────────────────────────────────────

def _join_sections(sections: list[tuple[str, str]]) -> str:
    parts = []
    for title, body in sections:
        body = str(body).strip()
        if not body:
            continue
        parts.append(f"[{title}]\n{body}")
    return "\n\n".join(parts).strip()


def _normalize_any(value: Any) -> str:
    if value is None:
        return ""

    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        return "\n".join(f"{k}: {_normalize_any(v)}" for k, v in value.items())

    if isinstance(value, list):
        return "\n".join(f"- {_normalize_any(v)}" for v in value)

    return str(value).strip()


def _clean_model_output(text: str) -> str:
    text = str(text or "").strip()

    text = re.sub(r"^```(?:markdown|md|text)?\s*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s*```$", "", text)

    text = text.replace("\u00a0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)

    text = re.sub(r"^\s*(최종\s*소견|종합\s*소견)\s*[:：]\s*", "", text, flags=re.IGNORECASE)

    return text.strip()


def _safe_float(value: Any) -> float | None:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _get_case_insensitive(d: dict[str, Any], key: str) -> Any:
    if key in d:
        return d[key]
    for k, v in d.items():
        if k.lower() == key.lower():
            return v
    return None


# ──────────────────────────────────────────────
# Example
# ──────────────────────────────────────────────

if __name__ == "__main__":
    example_modal_results = {
        "cxr": [
            {
                "study_id": "cxr-1",
                "text": "Right lower lobe consolidation. No pneumothorax.",
            }
        ],
        "lab": {
            "WBC": "18,500/uL, elevated",
            "Lactate": "3.2 mmol/L",
            "Troponin": "within normal range",
        },
        "ecg": {
            "study_id": "ecg-1",
            "text": "Sinus tachycardia 110 bpm. No ST elevation.",
        },
    }

    example_rag_response = {
        "fallback": False,
        "results": [
            {
                "id": "case-001",
                "document": "Patient admitted with fever, leukocytosis, and right lower lobe pneumonia...",
                "metadata": {
                    "chunk_type": "discharge_summary",
                    "hadm_id": "123456",
                },
                "similarity": 0.86,
            },
            {
                "id": "case-002",
                "document": "Radiology report showed right lower lobe consolidation consistent with pneumonia...",
                "metadata": {
                    "chunk_type": "radiology",
                    "hadm_id": "789012",
                },
                "similarity": 0.82,
            },
        ],
    }

    package = build_final_prompt_package(
        patient_summary="발열과 호흡곤란으로 내원. 폐렴 및 패혈증 가능성 평가 필요.",
        chief_complaint="fever, dyspnea",
        vitals={"HR": "110 bpm", "BP": "95/60 mmHg", "SpO2": "91% room air"},
        modal_results=example_modal_results,
        rag_response=example_rag_response,
    )

    print("=" * 80)
    print("[Selected Model]")
    print(package.selected_model)
    print(package.selected_model_reason)
    print("=" * 80)
    print("[User Prompt]")
    print(package.user_prompt)
    print("=" * 80)
    print("[Bedrock Body]")
    print(build_bedrock_body(package)[:1000] + "...")
