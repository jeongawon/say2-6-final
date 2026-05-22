# Central Orchestrator 통합 가이드 — RAG + 최종 소견 생성

> 대상: lji (컴퓨팅/Orchestrator 담당)  
> 작성: yji  
> 날짜: 2026-05-19

---

## 넘기는 파일 2개

```
architect/Data-RAG/Central_handoff/
├── retrieval_query_builder.py         ← RAG 검색용 query 생성
└── central_final_opinion_builder.py   ← 최종 Bedrock 소견 생성
```

---

## Orchestrator 흐름에 붙이는 방법

```python
# 1. 모달 결과 수집 완료 후
modal_results = {
    "cxr": [...],
    "lab": {...},
    "ecg": {...},
}

# 2. RAG 검색용 query 생성
from retrieval_query_builder import build_retrieval_query

retrieval = build_retrieval_query(
    patient_summary="발열, 호흡곤란으로 내원",
    chief_complaint="fever, dyspnea",
    vitals={"HR": "110", "BP": "95/60", "SpO2": "91%"},
    modal_results=modal_results,
)

# 3. RAG API 호출
import httpx

rag_response = httpx.post(
    "http://rag-svc.say2-6team.local:8000/query",
    json=retrieval.to_rag_request(),
).json()

# 4. 최종 소견 프롬프트 패키지 생성
from central_final_opinion_builder import (
    build_final_prompt_package,
    invoke_bedrock_final_opinion,
)

package = build_final_prompt_package(
    patient_summary="발열, 호흡곤란으로 내원",
    chief_complaint="fever, dyspnea",
    vitals={"HR": "110", "BP": "95/60", "SpO2": "91%"},
    modal_results=modal_results,
    rag_response=rag_response,
)

# 5. Bedrock 호출 + 후처리
result = invoke_bedrock_final_opinion(package)

# 6. 결과 사용
print(result.text)                    # 최종 소견서 텍스트
print(result.valid_required_sections) # 필수 섹션 모두 있는지
print(result.missing_sections)        # 누락된 섹션 목록
print(result.warnings)                # 경고 사항
```

---

## 각 파일 역할

### retrieval_query_builder.py

| 항목 | 내용 |
|------|------|
| 입력 | patient_summary, modal_results, vitals, chief_complaint |
| 출력 | `RetrievalQueryResult` (query 문자열 + 메타데이터) |
| 용도 | RAG API에 넘길 검색 쿼리 생성 |
| 특징 | 섹션별 글자 수 예산 분배, 의료 키워드 우선 보존, 빈 값 필터링 |

### central_final_opinion_builder.py

| 항목 | 내용 |
|------|------|
| 입력 | modal_results + rag_response + 환자 정보 |
| 출력 | `FinalPromptPackage` → `FinalOpinionResult` |
| 용도 | Bedrock Claude 호출 + 병원 소견서 양식 생성 |
| 특징 | 모델 라우팅(Haiku/Sonnet), 후처리(누락 섹션 감지/보강) |

---

## 모델 라우팅 기준

```
기본: Haiku (비용 절감, ~85~90%)

Sonnet 트리거 (~10~15%):
1. 생명 위협 critical signal (심정지, 쇼크, 호흡부전, STEMI 등)
2. 수치 기반 위험 (Lactate≥4, SpO2<90, SBP<90, MAP<65, HR>150, RR>30)
3. RAG fallback (유사 사례 없음)
4. RAG top similarity < 0.25

부정 표현 처리:
- "No shock", "쇼크 없음" 같은 부정 표현이 있어도 Sonnet은 트리거됨 (안전 마진)
- 단, reason에 "with negation context" 표시 → 로그 분석 시 추적 가능
- 향후 오탐 비율 높으면 Haiku 전환 로직 추가 검토
```

---

## 필요한 의존성

```
# requirements.txt에 추가
boto3
```

다른 외부 라이브러리 없음. 표준 라이브러리(re, json, dataclasses, os, time)만 사용.

---

## IAM 권한

Orchestrator Task Role (`say2-6team-orchestrator-role-arn`)에 이미 포함됨:
- `bedrock:InvokeModel` ✅
- `bedrock:InvokeModelWithResponseStream` ✅

추가 권한 필요 없음.

---

## 환경변수 (선택)

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `LLM_MODEL_HAIKU` | `anthropic.claude-3-haiku-20240307-v1:0` | Haiku 모델 ID |
| `LLM_MODEL_SONNET` | `us.anthropic.claude-sonnet-4-20250514-v1:0` | Sonnet 모델 ID |
| `LLM_MAX_TOKENS` | `4096` | 최대 출력 토큰 |
| `LLM_TEMPERATURE` | `0.2` | 생성 온도 |

설정 안 하면 기본값으로 동작.

---

## 출력 형식 (병원 소견서)

```
[병원 로고 / 환자 식별 정보]
환자명 | 등록번호 | 생년월일/성별 | 진료일자
────────────────────────────────────────
[주증상 / Chief Complaint]
[현병력 / Present Illness]
[과거력 / Past History]
[진찰 소견 / Physical Exam]
[검사 소견 / Investigation]
[RAG 참고 근거 / Similar Case Reference]
[진단명 / Impression]
[치료 계획 / Plan]
────────────────────────────────────────
※ 면책 문구
진료의 ○○○ / YYYY. MM. DD
```

---

## 주의사항

1. `retrieval_query_builder.py`는 RAG API 호출 **전**에 사용
2. `central_final_opinion_builder.py`는 RAG API 호출 **후**에 사용
3. 두 파일은 독립적 — 서로 import 안 함
4. `invoke_bedrock_final_opinion()`은 최대 3회 재시도 포함
5. 후처리에서 누락 섹션 감지 시 자동 보강하지만, `valid_required_sections=False`면 로그 남기기 권장
