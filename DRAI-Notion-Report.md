# DRAI 프로젝트 — DB & 모니터링 설계 보고서

> **작성 목적**: 노션 정리용 — 처음 보는 사람도 전체 구조를 이해할 수 있도록 작성
> **프로젝트명**: DRAI (응급 의료 멀티모달 AI 에이전트)
> **작성일**: 2026-05-14
> **브랜치**: feature_db → GitHub: jeongawon/say2-6-final

---

## 📌 이 문서는 무엇인가

DRAI 프로젝트는 응급실에서 ECG(심전도), CXR(흉부 X-ray), Lab(혈액검사) 3가지 AI 모달을 통합해 의사의 진단을 보조하는 시스템이다.

이 보고서는 그 시스템의 **데이터베이스 설계**와 **AWS 모니터링 설계**를 정리한다.

---

## 1부 — 데이터베이스 설계 (Aurora Serverless v2)

### 1-1. 왜 이 DB를 선택했나

AWS Aurora Serverless v2는 사용한 만큼만 비용이 나가는 PostgreSQL 호환 DB다.

| 비교 항목 | Aurora Serverless v2 | 일반 RDS PostgreSQL |
|----------|:---:|:---:|
| 데모 최소 비용 | **~$4/월** | ~$15/월 |
| 유휴 시 비용 | 거의 0 | 계속 발생 |
| 스케일링 | 자동 (초 단위) | 수동 변경 필요 |
| SQL / JOIN 지원 | ✅ | ✅ |
| FHIR 서버 호환 | ✅ | ✅ |

**핵심 이유**: 데모/개발 단계에서 아무도 안 쓸 때 비용이 거의 0이고, 응급 상황처럼 트래픽이 갑자기 몰려도 자동으로 확장된다.

---

### 1-2. DB 구조 — 왜 2개인가

같은 Aurora 클러스터 안에 DB를 2개 운영한다.

```
Aurora Serverless v2 클러스터 (say2-6team-aurora-cluster)
│
├── drai_ops   ← 우리가 직접 설계하고 관리하는 운영 DB
│
└── hapi       ← HAPI FHIR 서버가 자동으로 생성/관리하는 DB
```

**왜 분리했나?**

DRAI는 의료 표준인 FHIR(Fast Healthcare Interoperability Resources)을 준수해야 한다. HAPI FHIR라는 오픈소스 서버가 환자 정보, 바이탈, 검사 오더를 FHIR 형식으로 저장한다.

문제는 AI 추론 결과다. ECG 모델이 24개 질환 확률을 반환하는데, 이걸 FHIR 형식으로 변환하면 구조가 손실된다. 그래서 AI 결과는 `drai_ops`에 원본 그대로 보존한다.

```
환자 정보, 바이탈, 검사 오더  →  hapi DB  (FHIR 표준)
AI 추론 결과, 소견서, 이벤트  →  drai_ops (우리 설계)
```

---

### 1-3. drai_ops 테이블 4개

#### 테이블 관계도

```
encounters (응급실 방문 1건)
    │
    ├──→ modal_results      (ECG/CXR/Lab AI 추론 결과)
    ├──→ diagnostic_reports (AI 종합 소견 + 의사 서명)
    └──→ modal_events       (WebSocket 이벤트 로그)
```

#### ① encounters — 응급실 방문 1건

환자가 응급실에 도착하면 생성되는 레코드다. FHIR Encounter ID를 그대로 PK로 사용해서 HAPI FHIR와 1:1로 연결된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| encounter_id | TEXT (PK) | FHIR Encounter ID |
| patient_id | TEXT | FHIR Patient ID |
| subject_id | VARCHAR(20) | MIMIC 환자 ID (S3 파일 조회 키) |
| chief_complaint | TEXT | 주 증상 |
| patient_name / age / gender | — | 환자 기본 정보 |
| status | VARCHAR(20) | active / closed |
| metadata | JSONB | 유연한 확장용 |

#### ② modal_results — AI 추론 원본 응답 ⭐

이 테이블이 핵심이다. ECG, CXR, Lab 모달이 반환한 JSON 응답을 원본 그대로 저장한다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | BIGSERIAL (PK) | 자동 증가 |
| encounter_id | TEXT (FK) | 소속 방문 |
| modality | VARCHAR(16) | ECG / CXR / LAB |
| raw_response | JSONB | 모달 원본 응답 전체 |
| risk_level | VARCHAR(20) | routine / urgent / critical |
| summary | TEXT | 소견 요약 |

**설계 포인트**:
- `UNIQUE(encounter_id, modality)` → 방문당 모달 1개 결과만 저장 (재실행 시 UPSERT)
- `raw_response`에 GIN 인덱스 → JSONB 내부 필드 빠른 검색
- Bedrock Claude가 종합 판단할 때 이 원본 JSON을 그대로 투입

#### ③ diagnostic_reports — 종합 소견서

Bedrock Claude가 모든 모달 결과를 종합해 생성한 소견서다. 의사가 수정하고 서명하면 확정된다.

| 컬럼 | 타입 | 설명 |
|------|------|------|
| encounter_id | TEXT (FK) | 소속 방문 |
| ai_diagnosis | TEXT | AI 종합 소견 |
| ai_recommendations | JSONB | 권고 조치 목록 |
| physician_edits | TEXT | 의사 수정 내용 |
| status | VARCHAR(20) | preliminary → signed → amended |
| signed_by / signed_at | — | 서명 의사 및 시각 |

**설계 포인트**: `UNIQUE(encounter_id)` → 방문당 소견서 1개만 존재

#### ④ modal_events — WebSocket 이벤트 로그

프론트엔드와 실시간 통신하는 WebSocket 이벤트를 기록한다. 디버깅과 이벤트 재전송 대비용이다.

| event_type 예시 | 의미 |
|----------------|------|
| initial_proposals | 트리아지 완료 후 첫 모달 추천 |
| modal_completed | 모달 분석 완료 |
| ready_for_report | 모든 모달 완료 → 소견서 생성 가능 |

---

### 1-4. 자동화 트리거 2개

DB에 데이터가 들어올 때 자동으로 실행되는 함수다.

| 트리거 | 언제 실행 | 하는 일 |
|--------|---------|--------|
| `_fill_subject_id()` | INSERT 시 | encounter_id로 subject_id 자동 조회해서 채움 |
| `_bump_updated_at()` | UPDATE 시 | updated_at 컬럼 자동 갱신 |

---

### 1-5. 보안 설계

```
[인터넷]
    │  ✕ 직접 접근 불가
    ▼
[VPC Private Subnet]
    │
    ├── 중앙백엔드 (FastAPI) ──→ Aurora:5432 ✓
    └── HAPI FHIR 서버      ──→ Aurora:5432 ✓
```

| 보안 항목 | 방법 |
|----------|------|
| 네트워크 격리 | VPC Private Subnet + Security Group |
| 비밀번호 관리 | AWS Secrets Manager (30일 자동 로테이션) |
| 저장 암호화 | KMS AES-256 |
| 전송 암호화 | TLS 강제 |
| DB 사용자 | app_user(읽기/쓰기), hapi_user(FHIR 전용), readonly_user(조회만) |

---

### 1-6. 비용

| 사용 패턴 | 월 비용 |
|----------|:-------:|
| 데모 (하루 1~2시간) | **~$4** |
| 개발 (하루 8시간) | **~$24** |
| 프로덕션 (24시간, 2차 병원 1개소) | **~$273** |

> 💡 데모 시 Reader 인스턴스 제거하면 월 ~$86 추가 절감 가능

---

### 1-7. 파일 구성

| 파일 | 역할 |
|------|------|
| `aurora-cluster.yaml` | 클러스터 인프라 설정 (엔진, 스케일링, VPC, 백업) |
| `schema.yaml` | 테이블 구조 문서 (컬럼, 타입, 인덱스, 트리거) |
| `security.yaml` | 보안 설정 (네트워크, 암호화, DB 사용자) |
| `migrations.yaml` | 실제 실행 SQL (001~006 순서대로 실행) |
| `README.md` | 전체 개요 및 배포 방법 |
| `GUIDE.md` | 상세 설명 (요금 계산, 옵션 비교) |

> ⚠️ YAML 파일은 설계 문서다. 실제 DB 생성은 `migrations.yaml`의 SQL을 실행해야 한다.

---

## 2부 — 모니터링 설계

### 2-1. 왜 모니터링이 필요한가

응급 의료 시스템은 24시간 운영된다. 문제가 생겼을 때 사람이 발견하기 전에 자동으로 감지하고 알림을 보내야 한다.

- AI 추론 서비스 다운 → 의사가 결과를 못 받음
- DB 장애 → 환자 데이터 접근 불가
- 보안 침해 → 환자 개인정보 유출

---

### 2-2. 모니터링 4계층 구조

```
Layer 4  aws-config.yaml    "인프라가 보안 기준을 지금도 충족하는가?"
         ↓ 위반 시 자동 교정 또는 알림

Layer 3  cloudtrail.yaml    "누가 언제 어떤 AWS 리소스를 변경했는가?"
         ↓ 모든 API 호출 기록, 고위험 이벤트 즉시 알림

Layer 2  alarms.yaml        "임계값 초과 시 즉시 알림"
         eventbridge.yaml   "AWS 이벤트 발생 시 즉시 대응"
         ↓ SNS → 이메일 / Slack

Layer 1  cloudwatch.yaml    "로그 수집 + 메트릭 시각화"
         logging.yaml       "로그 포맷 표준 정의"
```

---

### 2-3. 파일별 상세 설명

#### ① cloudwatch.yaml — 로그 수집 + 메트릭 + 대시보드

**로그 그룹 8개** (서비스별 로그 저장소):

| 로그 그룹 | 서비스 | 보관 기간 |
|----------|--------|:--------:|
| /drai/central-backend | FastAPI 중앙백엔드 | 90일 |
| /drai/hapi-fhir | HAPI FHIR 서버 | 90일 |
| /drai/aurora/postgresql | Aurora DB 쿼리 로그 | 180일 |
| /drai/modal/ecg | ECG 추론 서비스 | 30일 |
| /drai/modal/cxr | CXR 추론 서비스 | 30일 |
| /drai/modal/lab | Lab 추론 서비스 | 30일 |
| /drai/bedrock-agent | Bedrock Agent | 90일 |
| /drai/cloudtrail | AWS API 감사 로그 | 365일 |

**커스텀 메트릭** (중앙백엔드가 직접 전송):
- `CriticalRiskCount` — CRITICAL 위험도 환자 감지 횟수
- `InferenceErrorCount` — 모달 추론 실패 횟수
- `ModalInferenceLatency` — 모달별 추론 소요 시간 (ms)
- `ActiveEncounters` — 현재 진행 중인 방문 수

---

#### ② alarms.yaml — 이상 감지 알림

메트릭이 임계값을 넘으면 SNS를 통해 이메일/Slack으로 알림을 보낸다.

**알람 13개**:

| 알람 | 조건 | 심각도 |
|------|------|:------:|
| Aurora-ACU-Max | ACU 3.6 이상 (최대치 90%) | 🔴 CRITICAL |
| Aurora-FreeableMemory-Low | 여유 메모리 256MB 미만 | 🔴 CRITICAL |
| Backend-Task-Unhealthy | ECS Task 0개 (서비스 다운) | 🔴 CRITICAL |
| Critical-Risk-Detected | CRITICAL 위험도 환자 감지 | 🔴 CRITICAL |
| Modal-Inference-Error-Spike | 추론 에러 5분간 3회 이상 | 🔴 CRITICAL |
| ALB-5xx-High | 5xx 에러 5분간 10회 초과 | 🔴 CRITICAL |
| ALB-UnhealthyHost | Unhealthy 타겟 존재 | 🔴 CRITICAL |
| Aurora-CPU-High | CPU 80% 초과 5분 지속 | ⚠️ WARNING |
| Aurora-Connections-High | DB 연결 수 100개 초과 | ⚠️ WARNING |
| Backend-CPU-High | ECS CPU 80% 초과 | ⚠️ WARNING |
| Backend-Memory-High | ECS 메모리 85% 초과 | ⚠️ WARNING |
| High-Latency-Spike | 추론 5초 초과 5회/5분 | ⚠️ WARNING |
| ALB-TargetResponseTime-High | 평균 응답 3초 초과 | ⚠️ WARNING |

**알림 채널**:
- 🔴 CRITICAL → 이메일 + Slack #say2-6team-alerts (즉시 대응)
- ⚠️ WARNING → 이메일 (주의 필요)

---

#### ③ cloudtrail.yaml — AWS API 감사 추적

> CloudWatch와 다른 점: 앱 로그가 아니라 **AWS 인프라 조작 이력**을 기록한다.
> "누가 콘솔/CLI로 어떤 AWS 리소스를 변경했는가"

**감시 대상 고위험 이벤트 9개**:

| 이벤트 | 심각도 | 의미 |
|--------|:------:|------|
| DeleteDBCluster | 🔴 CRITICAL | Aurora 클러스터 삭제 시도 |
| DeleteSecret | 🔴 CRITICAL | Secrets Manager 시크릿 삭제 |
| PutBucketPolicy | 🔴 CRITICAL | S3 버킷 정책 변경 (데이터 유출 위험) |
| ModifyDBCluster | ⚠️ WARNING | Aurora 설정 변경 |
| StopDBCluster | ⚠️ WARNING | Aurora 클러스터 중지 |
| AttachRolePolicy | ⚠️ WARNING | IAM 역할에 정책 추가 |
| AuthorizeSecurityGroupIngress | ⚠️ WARNING | Security Group 인바운드 규칙 추가 |
| CreateUser | ⚠️ WARNING | IAM 사용자 생성 |
| ConsoleLogin (Root) | ℹ️ INFO | 루트 계정 콘솔 로그인 |

---

#### ④ aws-config.yaml — 규정 준수 검사

> CloudTrail과 다른 점: "언제 변경했나"가 아니라 **"지금 상태가 올바른가"**를 평가한다.

**Config Rules 17개** (자동 평가):

| 분류 | 규칙 수 | 주요 내용 |
|------|:-------:|---------|
| RDS/Aurora | 4개 | 암호화, 삭제 보호, Multi-AZ, 퍼블릭 접근 차단 |
| 네트워크/보안 | 3개 | SG 허가 포트, SSH 차단, VPC Flow Logs |
| 암호화 | 3개 | S3 암호화, S3 퍼블릭 차단, KMS 로테이션 |
| IAM | 3개 | 루트 액세스 키, 관리자 권한, MFA |
| ECS | 1개 | 로그 설정 확인 |
| Secrets Manager | 2개 | 로테이션, 미사용 시크릿 |

**자동 교정 3개**:
- RDS 퍼블릭 접근 감지 → 자동 비활성화
- S3 퍼블릭 접근 감지 → 자동 차단
- SSH 오픈 감지 → 알림 발송 (수동 조치, 오탐 방지)

---

#### ⑤ eventbridge.yaml — 이벤트 기반 자동화

> CloudWatch Alarms와 다른 점: 메트릭 수치가 아니라 **AWS 서비스 이벤트 자체**를 감지한다.

**규칙 12개**:

| 분류 | 규칙 수 | 예시 |
|------|:-------:|------|
| 인프라 이벤트 | 5개 | Aurora 페일오버, ECS 태스크 종료, Secrets 로테이션 실패 |
| 보안 이벤트 | 4개 | 루트 로그인, SG 변경, IAM 정책 변경, S3 정책 변경 |
| 스케줄 작업 | 2개 | 매일 09:00 KST 헬스체크, 매주 월요일 비용 리포트 |

---

#### ⑥ logging.yaml — 애플리케이션 로그 표준

모든 서비스가 동일한 JSON 형식으로 로그를 남기도록 표준을 정의한다. CloudWatch에서 통합 검색이 가능해진다.

**로그 형식 예시**:
```json
{
  "timestamp": "2026-05-14T09:15:32.456Z",
  "level": "INFO",
  "service": "central-backend",
  "trace_id": "1-abc123-def456",
  "encounter_id": "enc-7890",
  "subject_id": "p10001",
  "message": "Modal inference completed",
  "extra": {
    "modality": "ECG",
    "latency_ms": 480,
    "risk_level": "critical"
  }
}
```

**PHI(개인건강정보) 마스킹 규칙**:

| 필드 | 처리 방식 |
|------|---------|
| patient_name | `***` 마스킹 |
| patient_id | 해시 처리 |
| password / authorization | 완전 제거 |
| raw_response (AI 결과) | 마스킹 없음 (디버깅 필수) |

---

### 2-4. 의료 규정 준수

| 요구사항 | 대응 방법 | 관련 파일 |
|----------|---------|---------|
| 환자 데이터 접근 로그 6년 보관 | CloudTrail → S3 장기 보관 | cloudtrail.yaml |
| DB 쿼리 감사 기록 | pgaudit + CloudWatch 180일 | cloudwatch.yaml |
| 인프라 변경 이력 추적 | AWS Config 일일 스냅샷 | aws-config.yaml |
| 암호화 상태 검증 | Config Rule: rds-storage-encrypted | aws-config.yaml |
| 퍼블릭 접근 자동 차단 | Config Rule + 자동 교정 | aws-config.yaml |
| PHI 로그 노출 방지 | 로그 마스킹 규칙 | logging.yaml |

---

## 3부 — 전체 비용 요약

### DB + 모니터링 합산

| 구성 요소 | 데모/PoC | 프로덕션 (24시간) |
|----------|:--------:|:----------------:|
| Aurora Serverless v2 | ~$4/월 | ~$273/월 |
| CloudWatch (로그+메트릭+대시보드) | ~$6/월 | ~$23/월 |
| CloudWatch Alarms (13개) | ~$1.3/월 | ~$1.3/월 |
| CloudTrail | ~$1/월 | ~$5/월 |
| AWS Config (17개 규칙) | ~$5/월 | ~$5/월 |
| EventBridge + SNS | ~$0.5/월 | ~$2/월 |
| **총합** | **~$18/월** | **~$309/월** |

---

## 4부 — 전체 시스템 아키텍처

```
사용자 (의사 / 간호사)
        │ HTTPS
        ▼
  CloudFront + WAF
        │
        ▼
  ALB (Application Load Balancer)
        │
        ▼
  중앙백엔드 (FastAPI, ECS Fargate)
  ┌──────────────────────────────────────────────┐
  │  트리아지 접수 → HAPI FHIR에 Patient 생성      │
  │  모달 호출    → modal_results에 결과 저장       │
  │  Bedrock 종합 → diagnostic_reports 생성       │
  │  WebSocket   → modal_events에 로그            │
  └──────┬──────────────┬──────────────┬──────────┘
         │              │              │
         ▼              ▼              ▼
   HAPI FHIR        Bedrock        SageMaker
   (hapi DB)        Claude         ECG / CXR
                    (종합 판단)     Lab 서비스
         │
         ▼
  Aurora Serverless v2
  ┌──────────────┬──────────────┐
  │  drai_ops    │    hapi      │
  │  (AI 결과)   │  (FHIR 표준) │
  └──────────────┴──────────────┘
         │
         ▼
  CloudWatch + CloudTrail + Config + EventBridge
  (모니터링 / 감사 / 규정 준수)
```

---

## 5부 — 배포 순서 (참고용)

| 단계 | 작업 | 참고 파일 |
|------|------|---------|
| 1 | Aurora 클러스터 생성 | aurora-cluster.yaml |
| 2 | VPC / Security Group / IAM 설정 | security.yaml |
| 3 | Secrets Manager 시크릿 생성 | security.yaml |
| 4 | DB 초기화 (SQL 001~006 실행) | migrations.yaml |
| 5 | CloudWatch 로그 그룹 생성 | cloudwatch.yaml |
| 6 | CloudWatch 알람 + SNS 설정 | alarms.yaml |
| 7 | CloudTrail 활성화 | cloudtrail.yaml |
| 8 | AWS Config 활성화 | aws-config.yaml |
| 9 | EventBridge 규칙 생성 | eventbridge.yaml |

> ⚠️ **주의**: 현재 YAML 파일은 설계 문서다. AWS에 자동 배포하려면 CloudFormation 또는 CDK 형식으로 변환이 필요하다.

---

*문서 기준: feature_db 브랜치 / github.com/jeongawon/say2-6-final*
