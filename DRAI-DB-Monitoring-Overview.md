# DRAI 프로젝트 — DB & 모니터링 설계 요약

> **프로젝트**: 응급 의료 멀티모달 AI 에이전트 (ECG + CXR + Lab)
> **브랜치**: `feature_db`
> **위치**: `/Users/testmac/say2-6-final/`
> **작성일**: 2026-05-14

---

## 전체 구조 한눈에 보기

```
say2-6-final/
├── aurora-serverless/   ← Aurora DB 설계 (이 문서 1부)
│   ├── README.md
│   ├── GUIDE.md
│   ├── aurora-cluster.yaml
│   ├── schema.yaml
│   ├── security.yaml
│   └── migrations.yaml
│
└── monitoring/          ← 모니터링 설계 (이 문서 2부)
    ├── README.md
    ├── cloudwatch.yaml
    ├── alarms.yaml
    ├── cloudtrail.yaml
    ├── aws-config.yaml
    ├── eventbridge.yaml
    └── logging.yaml
```

> ⚠️ **중요**: 이 YAML 파일들은 **설계 문서**다.
> AWS에 바로 배포하려면 CloudFormation 또는 CDK 형식으로 변환이 필요하다.
> 실제 실행 가능한 SQL은 `migrations.yaml` 및 `final/central/backend/app/db/schema.sql`에 있다.

---

# 1부 — Aurora Serverless v2 DB 설계

## 왜 Aurora Serverless v2인가

| 비교 항목 | Aurora Serverless v2 | 일반 RDS |
|----------|:---:|:---:|
| 데모 최소 비용 | **~$4/월** | ~$15/월 |
| 유휴 시 비용 | 거의 0 | 계속 발생 |
| 스케일링 | 자동 (초 단위) | 수동 |
| FHIR 서버 호환 | ✅ | ✅ |
| SQL / JOIN | ✅ | ✅ |

## DB 구조 — 같은 클러스터에 2개 DB

```
Aurora Serverless v2 클러스터 (say2-6team-aurora-cluster)
│
├── drai_ops  ← 우리가 직접 관리하는 운영 DB
│   ├── encounters         (응급실 방문 1건)
│   ├── modal_results      (ECG/CXR/Lab AI 추론 원본 JSON)
│   ├── diagnostic_reports (AI 종합 소견 + 의사 서명)
│   └── modal_events       (WebSocket 이벤트 로그)
│
└── hapi      ← HAPI FHIR 서버가 자동 관리
    └── (Patient, Encounter, Observation 등 FHIR R4 리소스)
```

**왜 2개로 분리했나?**
- AI 추론 결과(`raw_response`)를 FHIR 형식으로 변환하면 구조가 손실됨
- HAPI FHIR는 자체 스키마를 자동 생성 → 우리가 건드리면 안 됨
- `drai_ops`는 우리 비즈니스 로직에 최적화된 구조로 자유롭게 설계

## drai_ops 테이블 4개

### encounters — 응급실 방문 1건
```
encounter_id  TEXT PK     ← FHIR Encounter ID 그대로 사용
patient_id    TEXT        ← FHIR Patient ID
subject_id    VARCHAR(20) ← MIMIC 환자 ID (S3 파일 조회 키)
chief_complaint, patient_name, patient_age, patient_gender
started_at, closed_at
status        VARCHAR(20) ← 'active' | 'closed'
metadata      JSONB       ← 유연한 확장용
```

### modal_results — AI 추론 원본 응답 ⭐ 핵심 테이블
```
id            BIGSERIAL PK
encounter_id  TEXT FK → encounters (CASCADE)
modality      VARCHAR(16)     ← 'ECG' | 'CXR' | 'LAB'
raw_response  JSONB NOT NULL  ← 모달 서비스 원본 응답 전체 보존
risk_level    VARCHAR(20)     ← 'routine' | 'urgent' | 'critical'
summary       TEXT
UNIQUE(encounter_id, modality)  ← 방문당 모달 1개 결과만
GIN 인덱스 on raw_response      ← JSONB 내부 검색 최적화
```

### diagnostic_reports — 종합 소견서
```
id                 BIGSERIAL PK
encounter_id       TEXT FK → encounters (CASCADE)
ai_diagnosis       TEXT        ← Bedrock Claude 종합 소견
ai_recommendations JSONB       ← 권고 조치 목록
physician_edits    TEXT        ← 의사 수정 내용
status             VARCHAR(20) ← 'preliminary' | 'signed' | 'amended'
signed_by, signed_at
UNIQUE(encounter_id)  ← 방문당 소견서 1개
```

### modal_events — WebSocket 이벤트 로그
```
id            BIGSERIAL PK
encounter_id  TEXT
event_type    VARCHAR(40) ← 'initial_proposals', 'modal_completed' 등
payload       JSONB       ← 이벤트 전체 내용
```

## 트리거 2개

| 트리거 | 동작 | 적용 테이블 |
|--------|------|------------|
| `_fill_subject_id()` | encounter_id로 INSERT 시 subject_id 자동 조회 | modal_results, diagnostic_reports, modal_events |
| `_bump_updated_at()` | UPDATE 시 updated_at 자동 갱신 | diagnostic_reports |

## 보안 설정 요약

```
네트워크:  VPC Private Subnet (인터넷 직접 접근 불가)
           Security Group: 중앙백엔드 + HAPI FHIR만 5432 허용

인증:      Secrets Manager에 비밀번호 저장 (30일 자동 로테이션)
           IAM 역할 기반 인증 (토큰 방식)

암호화:    저장 시 — KMS AES-256
           전송 시 — TLS 강제

DB 사용자:
  app_user     → drai_ops (SELECT/INSERT/UPDATE/DELETE)
  hapi_user    → hapi (ALL)
  readonly_user → drai_ops (SELECT만)
```

## 비용 (서울 리전 ap-northeast-2)

| 사용 패턴 | 월 비용 |
|----------|:-------:|
| 데모 (하루 1~2시간) | **~$4** |
| 개발 (하루 8시간) | **~$24** |
| 프로덕션 (24시간, Writer+Reader) | **~$273** |

**비용 절감 팁**: 데모 시 Reader 인스턴스 제거 → 월 ~$86 절감

## 파일별 역할

| 파일 | 역할 |
|------|------|
| `aurora-cluster.yaml` | 클러스터 인프라 설정 (엔진, ACU, VPC, 백업) |
| `schema.yaml` | 테이블 구조 문서 (컬럼, 타입, 인덱스) |
| `security.yaml` | 보안 설정 (네트워크, 암호화, 사용자) |
| `migrations.yaml` | 실제 실행 SQL (001~006 순서대로) |
| `README.md` | 전체 개요 및 배포 방법 |
| `GUIDE.md` | 상세 설명 (요금 계산, 옵션 비교) |

---

# 2부 — 모니터링 설계

## 모니터링 계층 구조

```
Layer 4: 규정 준수     aws-config.yaml
         "인프라가 보안 기준을 지속적으로 충족하는가?"
         → 위반 시 자동 교정 또는 알림

Layer 3: 감사 추적     cloudtrail.yaml
         "누가 언제 어떤 AWS 리소스를 변경했는가?"
         → 모든 API 호출 기록, 고위험 이벤트 즉시 알림

Layer 2: 알림 & 자동화  alarms.yaml + eventbridge.yaml
         "임계값 초과 또는 이벤트 발생 시 즉시 대응"
         → SNS → 이메일/Slack 알림

Layer 1: 관측          cloudwatch.yaml + logging.yaml
         "로그 수집, 메트릭 시각화, 실시간 현황 파악"
         → 대시보드, Logs Insights 쿼리
```

## 파일별 역할

### `cloudwatch.yaml` — 로그 수집 + 메트릭 + 대시보드

**로그 그룹 8개**:

| 로그 그룹 | 서비스 | 보관 |
|----------|--------|:----:|
| `/drai/central-backend` | FastAPI 중앙백엔드 | 90일 |
| `/drai/hapi-fhir` | HAPI FHIR 서버 | 90일 |
| `/drai/aurora/postgresql` | Aurora DB 쿼리 로그 | 180일 |
| `/drai/modal/ecg` | ECG 추론 서비스 | 30일 |
| `/drai/modal/cxr` | CXR 추론 서비스 | 30일 |
| `/drai/modal/lab` | Lab 추론 서비스 | 30일 |
| `/drai/bedrock-agent` | Bedrock Agent | 90일 |
| `/drai/cloudtrail` | AWS API 감사 로그 | 365일 |

**커스텀 메트릭 (DRAI/Clinical 네임스페이스)**:
- `CriticalRiskCount` — CRITICAL 위험도 환자 감지 횟수
- `InferenceErrorCount` — 모달 추론 실패 횟수
- `ModalInferenceLatency` — 모달별 추론 소요 시간
- `ActiveEncounters` — 현재 진행 중인 방문 수

---

### `alarms.yaml` — 이상 감지 알림

**알람 13개 요약**:

| 알람 | 조건 | 심각도 |
|------|------|:------:|
| Aurora-ACU-Max | ACU 3.6 이상 (max의 90%) | 🔴 CRITICAL |
| Aurora-FreeableMemory-Low | 여유 메모리 256MB 미만 | 🔴 CRITICAL |
| Backend-Task-Unhealthy | ECS Task 0개 (서비스 다운) | 🔴 CRITICAL |
| Critical-Risk-Detected | CRITICAL 환자 감지 | 🔴 CRITICAL |
| Modal-Inference-Error-Spike | 추론 에러 5분간 3회 이상 | 🔴 CRITICAL |
| ALB-5xx-High | 5xx 에러 5분간 10회 초과 | 🔴 CRITICAL |
| ALB-UnhealthyHost | Unhealthy 타겟 존재 | 🔴 CRITICAL |
| Aurora-CPU-High | CPU 80% 초과 5분 지속 | ⚠️ WARNING |
| Aurora-Connections-High | 연결 수 100개 초과 | ⚠️ WARNING |
| Backend-CPU-High | ECS CPU 80% 초과 | ⚠️ WARNING |
| Backend-Memory-High | ECS 메모리 85% 초과 | ⚠️ WARNING |
| High-Latency-Spike | 추론 5초 초과 5회/5분 | ⚠️ WARNING |
| ALB-TargetResponseTime-High | 평균 응답 3초 초과 | ⚠️ WARNING |

**알림 채널**:
- `say2-6team-critical-alerts` → 이메일 + Slack #say2-6team-alerts
- `say2-6team-warning-alerts` → 이메일

---

### `cloudtrail.yaml` — AWS API 감사 추적

CloudWatch와 다른 점: 애플리케이션 로그가 아니라 **AWS 인프라 조작 이력**을 기록한다.

**감시 대상 고위험 이벤트**:

| 이벤트 | 심각도 | 의미 |
|--------|:------:|------|
| `DeleteDBCluster` | 🔴 CRITICAL | Aurora 클러스터 삭제 시도 |
| `DeleteSecret` | 🔴 CRITICAL | Secrets Manager 시크릿 삭제 |
| `PutBucketPolicy` | 🔴 CRITICAL | S3 버킷 정책 변경 (데이터 유출 위험) |
| `ModifyDBCluster` | ⚠️ WARNING | Aurora 설정 변경 |
| `StopDBCluster` | ⚠️ WARNING | Aurora 클러스터 중지 |
| `AttachRolePolicy` | ⚠️ WARNING | IAM 역할에 정책 추가 |
| `AuthorizeSecurityGroupIngress` | ⚠️ WARNING | SG 인바운드 규칙 추가 |
| `ConsoleLogin` (Root) | ℹ️ INFO | 루트 계정 콘솔 로그인 |

---

### `aws-config.yaml` — 규정 준수 검사

CloudTrail과 다른 점: "언제 변경했나"가 아니라 **"지금 상태가 올바른가"**를 평가한다.

**Config Rules 17개 분류**:

| 분류 | 규칙 수 | 주요 내용 |
|------|:-------:|---------|
| RDS/Aurora | 4개 | 암호화, 삭제 보호, Multi-AZ, 퍼블릭 접근 차단 |
| 네트워크/보안 | 3개 | SG 허가 포트, SSH 차단, VPC Flow Logs |
| 암호화 | 3개 | S3 암호화, S3 퍼블릭 차단, KMS 로테이션 |
| IAM | 3개 | 루트 액세스 키, 관리자 권한, MFA |
| ECS | 1개 | 로그 설정 |
| Secrets Manager | 2개 | 로테이션, 미사용 시크릿 |

**자동 교정 3개**:
- RDS 퍼블릭 접근 → 자동 비활성화
- S3 퍼블릭 접근 → 자동 차단
- SSH 오픈 → 알림 (수동 조치, 오탐 방지)

---

### `eventbridge.yaml` — 이벤트 기반 자동화

CloudWatch Alarms와 다른 점: 메트릭 수치가 아니라 **AWS 서비스 이벤트 자체**를 감지한다.

**규칙 12개 분류**:

| 분류 | 규칙 수 | 예시 |
|------|:-------:|------|
| 인프라 이벤트 | 5개 | Aurora 페일오버, ECS 태스크 종료, Secrets 로테이션 실패 |
| 보안 이벤트 | 4개 | 루트 로그인, SG 변경, IAM 정책 변경, S3 정책 변경 |
| 스케줄 작업 | 2개 | 매일 09:00 헬스체크, 매주 월요일 비용 리포트 |

---

### `logging.yaml` — 애플리케이션 로그 표준

모든 서비스가 동일한 JSON 형식으로 로그를 남기도록 표준을 정의한다.

**로그 필드**:
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

**PHI 마스킹 규칙**:
- `patient_name` → `***` 마스킹
- `patient_id` → 해시 처리
- `password`, `authorization` → 완전 제거

---

## 전체 비용 합산

| 구성 요소 | 데모/PoC | 프로덕션 |
|----------|:--------:|:--------:|
| Aurora Serverless v2 | ~$4/월 | ~$273/월 |
| 모니터링 전체 | ~$14/월 | ~$36/월 |
| **총합** | **~$18/월** | **~$309/월** |

---

## 다음 단계 (배포 시)

1. **Aurora 클러스터 생성** — `aurora-cluster.yaml` 참고, AWS 콘솔 또는 CLI
2. **보안 설정** — `security.yaml` 참고, VPC/SG/Secrets Manager/IAM
3. **DB 초기화** — `migrations.yaml` SQL을 001~006 순서대로 실행
4. **모니터링 설정** — `cloudwatch.yaml` → `alarms.yaml` → `cloudtrail.yaml` 순서로 적용
5. **CloudFormation 변환** — 자동 배포가 필요하면 YAML을 CloudFormation 템플릿으로 변환

---

*이 문서는 `/Users/testmac/say2-6-final/` 프로젝트의 `feature_db` 브랜치 기준으로 작성되었습니다.*
