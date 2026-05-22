"""
retrieval_query_builder.py

Central Orchestrator에서 RAG API로 넘길 retrieval query를 만드는 유틸 파일.

목적:
- ECG / CXR / LAB 결과를 그대로 길게 붙이지 않고, RAG 검색에 필요한 핵심 정보만 구조화한다.
- 모달/스터디별 라벨을 유지한다.
- 특정 모달이 너무 길어서 다른 모달이 잘리는 문제를 줄인다.
- 최종 Bedrock 프롬프트가 아니라 "RAG 검색용 query"만 만든다.

사용 위치:
- Central Orchestrator
- RAG API 호출 직전

예상 흐름:
    modal_results = {
        "cxr": [
            {"study_id": "cxr-1", "text": "..."},
            {"study_id": "cxr-2", "text": "..."}
        ],
        "lab": "...",
        "ecg": {"study_id": "ecg-1", "text": "..."}
    }

    result = build_retrieval_query(
        patient_summary="발열, 호흡곤란, 폐렴/패혈증 가능성 평가 필요",
        modal_results=modal_results,
    )

    rag_request = {"query": result.query}
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable
import re


# ──────────────────────────────────────────────
# 설정값
# ──────────────────────────────────────────────

DEFAULT_TOTAL_CHAR_LIMIT = 8000

# 모달별 예산.
# 합계가 total_char_limit(8000)을 넘지 않도록 조정.
DEFAULT_SECTION_LIMITS = {
    "patient_summary": 800,
    "chief_complaint": 600,
    "vitals": 800,
    "cxr": 1600,
    "lab": 2200,
    "ecg": 1200,
    "other": 400,
    "search_intent": 400,
}
# 합계: 800+600+800+1600+2200+1200+400+400 = 8000

# 너무 긴 텍스트에서 우선 보존할 의료 키워드.
# 검색용 요약이므로 "정상/비정상 판정에 중요한 수치와 소견"을 최대한 살린다.
IMPORTANT_PATTERNS = [
    # 감염/염증
    r"\bWBC\b", r"\bCRP\b", r"\bESR\b", r"\bprocalcitonin\b", r"\bPCT\b",
    r"\blactate\b", r"\blactic\b", r"\bfever\b", r"\bsepsis\b", r"\bshock\b",

    # 심장
    r"\btroponin\b", r"\bCK-MB\b", r"\bBNP\b", r"\bNT-proBNP\b",
    r"\bST\b", r"\bQT\b", r"\bQTc\b", r"\bT wave\b", r"\bsinus\b",
    r"\btachycardia\b", r"\bbradycardia\b", r"\barrhythmia\b",

    # 호흡/영상
    r"\bconsolidation\b", r"\binfiltration\b", r"\bopacity\b",
    r"\bpleural effusion\b", r"\bpneumothorax\b", r"\bedema\b",
    r"\batelectasis\b", r"\bpneumonia\b", r"\bARDS\b",

    # 신장/대사
    r"\bcreatinine\b", r"\bBUN\b", r"\beGFR\b", r"\bNa\b", r"\bK\b",
    r"\bglucose\b", r"\bpH\b", r"\bHCO3\b", r"\bPaO2\b", r"\bPaCO2\b",

    # 혈액/응고
    r"\bHb\b", r"\bHgb\b", r"\bplatelet\b", r"\bPLT\b",
    r"\bPT\b", r"\bINR\b", r"\baPTT\b", r"\bD-dimer\b",

    # 간담도
    r"\bAST\b", r"\bALT\b", r"\bbilirubin\b", r"\bALP\b", r"\bGGT\b",

    # 한국어 키워드
    r"패혈증", r"쇼크", r"심정지", r"삽관", r"호흡곤란", r"흉통", r"발열",
    r"폐렴", r"폐부종", r"기흉", r"흉수", r"경화", r"침윤", r"빈맥",
    r"서맥", r"부정맥", r"상승", r"감소", r"증가", r"저하", r"악화",
]


@dataclass
class RetrievalQueryResult:
    """RAG API로 전달할 retrieval query와 생성 메타데이터."""

    query: str
    char_count: int
    truncated: bool
    section_char_counts: dict[str, int] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)

    def to_rag_request(self) -> dict[str, str]:
        """현재 RAG API의 QueryRequest 스키마에 맞춘 dict."""
        return {"query": self.query}


# ──────────────────────────────────────────────
# Public API
# ──────────────────────────────────────────────

def build_retrieval_query(
    *,
    patient_summary: str | None = None,
    modal_results: dict[str, Any] | None = None,
    chief_complaint: str | None = None,
    vitals: str | dict[str, Any] | None = None,
    other_context: str | dict[str, Any] | None = None,
    search_intent: str | None = None,
    total_char_limit: int = DEFAULT_TOTAL_CHAR_LIMIT,
    section_limits: dict[str, int] | None = None,
) -> RetrievalQueryResult:
    """
    Central Orchestrator가 RAG에 넘길 검색용 query를 생성한다.

    Parameters
    ----------
    patient_summary:
        환자 요약. 예: "발열, 호흡곤란, 폐렴/패혈증 가능성 평가 필요"

    modal_results:
        모달 결과 dict.
        지원 형태:
            {
                "cxr": "문자열",
                "lab": [{"study_id": "lab-1", "text": "..."}],
                "ecg": {"study_id": "ecg-1", "text": "..."}
            }

    chief_complaint:
        주호소.

    vitals:
        활력징후. 문자열 또는 dict 가능.

    other_context:
        그 외 RAG 검색에 필요한 문맥.

    search_intent:
        검색 의도. 없으면 기본 문구를 사용한다.

    total_char_limit:
        최종 query 전체 최대 글자 수.
        Titan embedding 한계보다 보수적으로 8000자 기본값을 사용한다.

    section_limits:
        섹션별 최대 글자 수 override.

    Returns
    -------
    RetrievalQueryResult
    """
    limits = dict(DEFAULT_SECTION_LIMITS)
    if section_limits:
        limits.update(section_limits)

    warnings: list[str] = []
    sections: list[tuple[str, str]] = []

    if patient_summary:
        sections.append((
            "PATIENT_SUMMARY",
            _trim_section(str(patient_summary), limits["patient_summary"], "patient_summary", warnings),
        ))

    if chief_complaint:
        sections.append((
            "CHIEF_COMPLAINT",
            _trim_section(str(chief_complaint), limits["chief_complaint"], "chief_complaint", warnings),
        ))

    if vitals:
        vitals_text = _normalize_any(vitals)
        sections.append((
            "VITALS",
            _trim_section(vitals_text, limits["vitals"], "vitals", warnings),
        ))

    if modal_results:
        modal_sections = _build_modal_sections(modal_results, limits, warnings)
        sections.extend(modal_sections)

    if other_context:
        other_text = _normalize_any(other_context)
        sections.append((
            "OTHER_CONTEXT",
            _trim_section(other_text, limits["other"], "other", warnings),
        ))

    if not search_intent:
        search_intent = (
            "현재 환자의 ECG/CXR/LAB 결과와 유사한 과거 응급실 사례를 검색한다. "
            "정상 항목보다 비정상 수치, 병변 위치, 시간적 악화/호전, 응급 위험 신호를 우선 반영한다."
        )

    sections.append((
        "SEARCH_INTENT",
        _trim_section(search_intent, limits["search_intent"], "search_intent", warnings),
    ))

    query = _join_sections(sections)

    truncated = False
    if len(query) > total_char_limit:
        truncated = True
        warnings.append(
            f"total query exceeded limit: {len(query)} > {total_char_limit}; applying final smart truncation"
        )
        query = _smart_truncate(query, total_char_limit)

    section_char_counts = {
        title.lower(): len(body)
        for title, body in sections
    }

    return RetrievalQueryResult(
        query=query,
        char_count=len(query),
        truncated=truncated or bool(warnings),
        section_char_counts=section_char_counts,
        warnings=warnings,
    )


def build_retrieval_query_from_payload(payload: dict[str, Any]) -> RetrievalQueryResult:
    """
    Orchestrator payload dict에서 바로 retrieval query를 만든다.

    허용 키:
        patient_summary
        modal_results
        chief_complaint
        vitals
        other_context
        search_intent
    """
    return build_retrieval_query(
        patient_summary=payload.get("patient_summary"),
        modal_results=payload.get("modal_results"),
        chief_complaint=payload.get("chief_complaint"),
        vitals=payload.get("vitals"),
        other_context=payload.get("other_context"),
        search_intent=payload.get("search_intent"),
    )


# ──────────────────────────────────────────────
# Modal formatting
# ──────────────────────────────────────────────

def _build_modal_sections(
    modal_results: dict[str, Any],
    limits: dict[str, int],
    warnings: list[str],
) -> list[tuple[str, str]]:
    sections: list[tuple[str, str]] = []

    # RAG 검색에서 어느 정도 고정 순서를 유지한다.
    # vitals는 별도 인자로 받으므로 여기서는 모달 중심.
    modal_order = ["cxr", "lab", "ecg"]
    remaining = [k for k in modal_results.keys() if k.lower() not in modal_order]

    for modality in modal_order + remaining:
        value = _get_case_insensitive(modal_results, modality)
        if not value:
            continue

        key = modality.lower()
        limit = limits.get(key, limits["other"])
        title = key.upper()

        formatted = _format_modality_value(key, value)
        trimmed = _trim_section(formatted, limit, key, warnings)
        sections.append((title, trimmed))

    return sections


def _format_modality_value(modality: str, value: Any) -> str:
    """
    모달 결과를 스터디별 라벨이 보존되도록 문자열화한다.
    """
    if isinstance(value, str):
        return value.strip()

    if isinstance(value, dict):
        # 단일 study dict 형태
        if "text" in value or "result" in value or "summary" in value:
            study_id = value.get("study_id") or value.get("id") or f"{modality}-1"
            text = value.get("text") or value.get("result") or value.get("summary") or ""
            time = value.get("time") or value.get("timestamp") or value.get("date")
            prefix = f"- {study_id}"
            if time:
                prefix += f" ({time})"
            return f"{prefix}: {str(text).strip()}"

        # lab 수치 dict 같은 형태
        lines = []
        for k, v in value.items():
            lines.append(f"- {k}: {_normalize_any(v)}")
        return "\n".join(lines)

    if isinstance(value, list):
        parts = []
        for idx, item in enumerate(value, 1):
            if isinstance(item, dict):
                study_id = item.get("study_id") or item.get("id") or f"{modality}-{idx}"
                text = item.get("text") or item.get("result") or item.get("summary") or _normalize_any(item)
                time = item.get("time") or item.get("timestamp") or item.get("date")
                prefix = f"- {study_id}"
                if time:
                    prefix += f" ({time})"
                parts.append(f"{prefix}: {str(text).strip()}")
            else:
                parts.append(f"- {modality}-{idx}: {str(item).strip()}")
        return "\n".join(parts)

    return str(value).strip()


# ──────────────────────────────────────────────
# Text trimming
# ──────────────────────────────────────────────

def _trim_section(
    text: str,
    limit: int,
    section_name: str,
    warnings: list[str],
) -> str:
    text = _clean_text(text)

    # 빈 값 필터링: 줄 단위로 빈 값 제거
    lines = text.split("\n")
    filtered_lines = [line for line in lines if not _is_empty_value(line)]
    text = "\n".join(filtered_lines).strip()

    if not text:
        return ""

    if len(text) <= limit:
        return text

    original_len = len(text)
    truncated_text = _smart_truncate(text, limit)
    trimmed_amount = original_len - len(truncated_text)
    warnings.append(
        f"{section_name} section truncated: {original_len} → {len(truncated_text)} "
        f"(removed {trimmed_amount} chars)"
    )
    return truncated_text


def _smart_truncate(text: str, limit: int) -> str:
    """
    원래 줄 순서를 유지하면서 중요도 낮은 줄부터 제거한다.

    전략:
    1. 문장/줄 단위로 분리
    2. 각 줄에 중요도 점수 부여
    3. 중요도 낮은 줄부터 제거 (순서는 유지)
    4. limit 이내가 될 때까지 반복
    """
    text = _clean_text(text)

    if len(text) <= limit:
        return text

    lines = _split_to_lines(text)

    if not lines:
        return text[:limit - 40].rstrip() + "\n...[truncated]"

    # 각 줄에 (index, line, is_important) 태깅
    tagged = [(i, line, _is_important_line(line)) for i, line in enumerate(lines)]

    # 현재 총 길이 계산
    current_len = sum(len(line) + 1 for _, line, _ in tagged)

    # 중요도 낮은 줄부터 뒤에서 제거 (순서 유지)
    # 뒤쪽 일반 줄부터 제거
    non_important_indices = [i for i, (_, _, imp) in enumerate(tagged) if not imp]
    for idx in reversed(non_important_indices):
        if current_len <= limit - 40:
            break
        current_len -= len(tagged[idx][1]) + 1
        tagged[idx] = None  # type: ignore

    # 그래도 넘으면 중요 줄도 뒤에서 제거
    if current_len > limit - 40:
        important_indices = [i for i, t in enumerate(tagged) if t is not None]
        for idx in reversed(important_indices):
            if current_len <= limit - 40:
                break
            current_len -= len(tagged[idx][1]) + 1
            tagged[idx] = None  # type: ignore

    # 순서 유지하면서 남은 줄 조립
    result_lines = [t[1] for t in tagged if t is not None]
    result = "\n".join(result_lines).strip()

    if not result:
        result = text[:limit - 40].rstrip()

    return result + "\n...[truncated]"


def _is_important_line(line: str) -> bool:
    # 수치 포함 라인은 LAB/ECG에서 중요한 경우가 많다.
    has_number = bool(re.search(r"[-+]?\d+(\.\d+)?", line))

    # abnormal/normal 관련 표현도 검색에 중요할 수 있다.
    has_abnormal_word = bool(re.search(
        r"abnormal|normal|elevated|decreased|increased|positive|negative|"
        r"high|low|severe|mild|moderate|critical|worsen|improve|"
        r"비정상|정상|상승|감소|증가|양성|음성|악화|호전|중증|경도|중등도",
        line,
        flags=re.IGNORECASE,
    ))

    has_keyword = any(
        re.search(pattern, line, flags=re.IGNORECASE)
        for pattern in IMPORTANT_PATTERNS
    )

    return has_number or has_abnormal_word or has_keyword


def _split_to_lines(text: str) -> list[str]:
    # 줄바꿈이 없는 긴 문단도 어느 정도 분리한다.
    raw_lines = re.split(r"\n+|(?<=[.!?。])\s+", text)
    lines = []
    for line in raw_lines:
        line = line.strip()
        if not line:
            continue
        # 너무 긴 줄은 안전하게 잘라서 처리
        if len(line) > 600:
            chunks = [line[i:i + 600] for i in range(0, len(line), 600)]
            lines.extend(chunks)
        else:
            lines.append(line)
    return lines


# ──────────────────────────────────────────────
# Basic utils
# ──────────────────────────────────────────────

def _join_sections(sections: Iterable[tuple[str, str]]) -> str:
    parts = []
    for title, body in sections:
        body = body.strip()
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
        lines = []
        for k, v in value.items():
            lines.append(f"{k}: {_normalize_any(v)}")
        return "\n".join(lines)

    if isinstance(value, list):
        return "\n".join(f"- {_normalize_any(v)}" for v in value)

    return str(value).strip()


def _clean_text(text: str) -> str:
    text = str(text)
    # non-breaking space 등 복붙 문자 정리
    text = text.replace("\u00a0", " ")
    # 과도한 공백 정리
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# 빈 값 / 검사 미시행 판별용 패턴
_EMPTY_PATTERNS = re.compile(
    r"^(N/?A|n/?a|없음|unknown|null|none|미시행|검사\s*미시행|not\s*performed|not\s*available|"
    r"not\s*done|no\s*data|데이터\s*없음|기록\s*없음|-+|\.+|\s*)$",
    flags=re.IGNORECASE,
)

# 판독불가/품질불량은 보존 (임상적으로 의미 있음)
_KEEP_EVEN_IF_EMPTY = re.compile(
    r"판독\s*불가|품질\s*불량|uninterpretable|poor\s*quality|artifact|motion\s*artifact",
    flags=re.IGNORECASE,
)


def _is_empty_value(text: str) -> bool:
    """빈 값, N/A, unknown, 검사 미시행 등을 판별한다. 판독불가/품질불량은 보존."""
    text = text.strip()
    if _KEEP_EVEN_IF_EMPTY.search(text):
        return False
    return bool(_EMPTY_PATTERNS.match(text))


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
            },
            {
                "study_id": "cxr-2",
                "text": "Interval progression of right lower lobe opacity.",
            },
        ],
        "lab": {
            "WBC": "18,500/uL, elevated",
            "CRP": "elevated",
            "Lactate": "3.2 mmol/L",
            "Troponin": "within normal range",
            "Creatinine": "mildly elevated",
        },
        "ecg": {
            "study_id": "ecg-1",
            "text": "Sinus tachycardia 110 bpm. No ST elevation.",
        },
    }

    result = build_retrieval_query(
        patient_summary="발열과 호흡곤란으로 내원. 폐렴 및 패혈증 가능성 평가 필요.",
        chief_complaint="fever, dyspnea",
        vitals={
            "HR": "110 bpm",
            "BP": "95/60 mmHg",
            "SpO2": "91% room air",
        },
        modal_results=example_modal_results,
    )

    print("=" * 80)
    print(result.query)
    print("=" * 80)
    print(f"char_count={result.char_count}")
    print(f"truncated={result.truncated}")
    print(f"warnings={result.warnings}")
    print(f"rag_request={result.to_rag_request()}")
