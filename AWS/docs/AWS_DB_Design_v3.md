# 응급의료 AI 진단보조 시스템 데이터베이스 설계 문서

**Aurora Serverless v2 기반 · AWS 아키텍처 운영 문서 v3.0**

---

## § 1. 데이터베이스 개요

데이터베이스는 여러 사용자가 공유하여 사용할 목적으로 데이터를 구조화하여 저장·관리하는 시스템입니다. 우리 시스템은 데이터 성격에 따라 3가지 저장소를 분리합니다.

| 데이터 성격 | 저장 방식 | 우리 시스템 예시 |
|---|---|---|
| 정형 데이터 (숫자/텍스트/날짜) | 관계형 DB (Aurora PostgreSQL) | 환자 기본정보, LAB 수치, 소견 |
| 반정형 데이터 (JSON) | PostgreSQL JSONB | AI 추론 결과, FHIR 리소스 |
| 비정형 데이터 (이미지/파일) | 객체 스토리지 (S3) | CXR 사진, ECG 파형 |

> **S3는 데이터베이스가 아님**: 검색·조건 조회 불가. CXR 이미지는 S3에 저장하고, 해당 파일의 S3 주소(URL)만 PostgreSQL에 저장하여 연결합니다.

---

## § 2. Aurora Serverless v2 선택 근거

### 2.1 Amazon Aurora란

Amazon Aurora는 AWS가 클라우드 환경에 최적화해 처음부터 재설계한 관계형 데이터베이스입니다. MySQL·PostgreSQL과 완전 호환되지만 내부 스토리지 엔진이 다릅니다.

가장 큰 혁신은 **컴퓨트(인스턴스)와 스토리지의 분리**입니다. 모든 인스턴스가 3개 AZ에 걸친 공유 분산 스토리지를 함께 바라보며, 6개의 복사본이 자동 유지됩니다.

**Aurora Serverless v2**는 여기에 ACU(Aurora Capacity Unit) 단위로 컴퓨트를 자동 스케일링하는 기능을 추가한 버전입니다. 0.5 ACU부터 시작해 초 단위로 확장/축소합니다.

### 2.2 DB 옵션 비교 — 왜 Aurora Serverless v2인가

| 항목 | RDS PostgreSQL | Aurora Provisioned | Aurora SLv2 (★ 우리 선택) |
|---|---|---|---|
| 컴퓨트 사양 | 인스턴스 고정 | 인스턴스 고정 | ACU 자동 (0.5~4) |
| HA 구조 | Primary + 1 | 3AZ × 6복사 | 3AZ × 6복사 |
| Failover | 1~2분 | 30초 이내 | 30초 이내 |
| Read Replica | 최대 5개 | 최대 15개 | 최대 15개 |
| 스토리지 | 사전 설정 | 자동 확장 | 자동 확장 |
| 야간 저트래픽 | 고정 비용 | 고정 비용 | 자동 축소 (0.5 ACU) |
| 폭증 대응 | 수동 ASG | 수동 ASG | 자동 (초 단위) |
| 최소 비용 (월) | ~$50 | ~$200 | **~$45 (0.5 ACU)** |

**응급실 트래픽 특성**:
- 시간대별 변동 큼 (야간 1/5 수준) → Auto Scaling 필수
- 갑작스러운 폭증 가능 (다중 외상 등) → 초 단위 확장 필요
- Failover 시간이 임상에 직결 → 30초 이내 필수

→ **Aurora Serverless v2가 응급실 트래픽 패턴에 가장 적합**

### 2.3 PostgreSQL 엔진 선택 근거

| 이유 | 내용 |
|---|---|
| HAPI FHIR 의존성 | HAPI FHIR이 PostgreSQL 공식 권장, 내부 스키마 최적화 |
| JSONB 인덱싱 | AI 추론 결과 JSON 저장 + GIN 인덱스로 빠른 검색 |
| 임상 분석 SQL | Window Function, CTE, LATERAL JOIN 등 고급 SQL 완벽 지원 |

---

## § 3. 데이터베이스 구조 — 클러스터 1개 / DB 2개

### 3.1 클러스터 1개에 DB 2개 운영

Aurora 클러스터 1개 안에서 PostgreSQL 엔진이 여러 database를 둘 수 있습니다. `hapi`와 `central_db` 2개를 같은 클러스터에 두어 비용·운영 부담을 절반으로 줄입니다.

```
Aurora Serverless v2 클러스터 (Phase 1~2)
└─ PostgreSQL 엔진 (ACU 0.5~4)
   ├─ database "hapi"         ← HAPI FHIR 자동 관리
   └─ database "central_db"   ← FastAPI 백엔드 직접 관리

연결 URL (엔드포인트 동일, database 이름으로 구분):
  postgresql://prod-aurora.cluster-xxxx:5432/hapi
  postgresql://prod-aurora.cluster-xxxx:5432/central_db
```

**장점**:
- 비용 절감 — 클러스터 1개 ≈ $220/월, 분리 시 $440/월
- 운영 단순 — 백업·모니터링·VPC 설정 1세트
- 데이터 격리 — 각 DB는 독립 스키마·독립 권한
- 권한 분리 — 사용자별 접근 가능 DB 다르게 설정 가능

### 3.2 hapi DB — FHIR 표준 데이터 (HAPI 자동 관리)

| FHIR 리소스 | 실제 의미 | 저장 시점 |
|---|---|---|
| Patient | 환자 기본 정보 | 트리아지 시작 |
| Encounter | 응급실 방문 1건 | 트리아지 시작 |
| Observation | Vitals, ECG·LAB 수치 | 검사 완료 |
| Condition | 진단명 | 의사 confirm |
| ServiceRequest | 검사 요청 (ECG/CXR/LAB) | 모달 호출 |
| DocumentReference | CXR 이미지 S3 URL | CXR 모달 완료 |
| DiagnosticReport | AI 종합 소견 | Bedrock 소견 생성 |
| AllergyIntolerance | 알레르기 기록 | 트리아지 입력 |
| MedicationStatement | 복용 약물 | 트리아지 입력 |

테이블·SQL은 HAPI가 자동 생성·관리. 우리는 FHIR JSON만 HTTP로 송수신.

### 3.3 central_db — 운영 데이터 (FastAPI 직접 관리)

**5개 핵심 테이블**:

```
encounters             → 응급실 방문 1건
modal_results          → AI 모달 추론 결과 (ECG/CXR/LAB)
diagnostic_reports     → 종합 소견서 + 의사 서명
modal_events           → WebSocket 이벤트 로그
fhir_sync_queue        → ★ Graceful Degradation 큐
```

각 테이블 컬럼 상세는 § 10 ERD 다이어그램 참조.

### 3.4 JSONB 컬럼 (4개)

| 테이블.컬럼 | 용도 | 인덱스 |
|---|---|---|
| `encounters.metadata` | past_history, vitals 등 | — |
| `modal_results.raw_response` | AI 모달 원본 응답 | **GIN** |
| `diagnostic_reports.ai_recommendations` | 권고 목록 | — |
| `modal_events.payload` | actor·modality 등 | — |

---

## § 4. Graceful Degradation — fhir_sync_queue

### 4.1 문제 — HAPI 단일 인스턴스의 가용성 리스크

HAPI FHIR이 다운되면 운영 DB INSERT는 성공해도 FHIR PUT이 실패해 트랜잭션 전체가 롤백되어 임상 플로우가 중단될 수 있습니다.

### 4.2 해결 — 자동 큐 적재 + Retry Worker

```sql
CREATE TABLE fhir_sync_queue (
    id            BIGSERIAL PRIMARY KEY,
    encounter_id  TEXT NOT NULL,
    patient_id    TEXT,
    resource_type VARCHAR(40) NOT NULL,    -- Patient/Encounter/Observation 등
    resource_id   TEXT NOT NULL,           -- FHIR UUID
    payload       JSONB NOT NULL,          -- FHIR JSON 본문
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    retry_count   INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    synced_at     TIMESTAMPTZ
);

CREATE INDEX idx_fsq_pending ON fhir_sync_queue(status, created_at)
    WHERE status = 'pending';
CREATE INDEX idx_fsq_encounter ON fhir_sync_queue(encounter_id);
```

### 4.3 동작 흐름

```
[정상]                        [HAPI 다운]
운영 DB INSERT ✓              운영 DB INSERT ✓
HAPI PUT 시도 ✓               HAPI PUT 시도 ❌
                              → fhir_sync_queue 적재
                              → 의사 화면: 정상 등록 ✓
                              → 임상 플로우 무중단 ✓

                              [HAPI 복구]
                              Retry Worker (5분 주기)
                              → 큐 pending 항목 백필
                              → 16건 410ms 내 완료 (검증)
```

### 4.4 동기화 대상 11종 리소스

Patient · Encounter · Condition · Observation · AllergyIntolerance · MedicationStatement · ServiceRequest · ServiceRequestTransition · ServiceRequestPatch · DiagnosticReport · DiagnosticReportTransition

### 4.5 검증 결과 (TEST 1~3 통과)

| 테스트 | 시나리오 | 결과 |
|---|---|---|
| TEST 1 | HAPI 정상 | 모든 리소스 직접 PUT, 큐 비어있음 ✅ |
| TEST 2 | HAPI 다운 | 16건 큐 적재, 임상 무중단 ✅ |
| TEST 3 | HAPI 복구 | 16건 자동 백필 (410ms) ✅ |

→ **이 메커니즘 덕분에 HAPI를 EC2 1대로 운영해도 임상 가용성 100% 보장**

---

## § 5. 인덱스 · 트리거 · 무결성 제약

### 5.1 인덱스 전략 (총 17개)

```
[encounters — 3개]
idx_enc_patient            ON encounters(patient_id)
idx_enc_subject            ON encounters(subject_id)
idx_enc_status_start       ON encounters(status, started_at DESC)

[modal_results — 6개]
idx_mr_enc                 ON modal_results(encounter_id)
idx_mr_subject             ON modal_results(subject_id)
idx_mr_risk                ON modal_results(risk_level)
idx_mr_created             ON modal_results(created_at DESC)
idx_mr_sr                  ON modal_results(service_request_id)
idx_mr_raw_gin             ON modal_results USING GIN (raw_response)

[diagnostic_reports — 3개]
idx_dr_enc                 ON diagnostic_reports(encounter_id)
idx_dr_subject             ON diagnostic_reports(subject_id)
idx_dr_status              ON diagnostic_reports(status, created_at DESC)

[modal_events — 3개]
idx_me_enc_time            ON modal_events(encounter_id, created_at DESC)
idx_me_subject             ON modal_events(subject_id)
idx_me_type                ON modal_events(event_type)

[fhir_sync_queue — 2개] ★ 추가
idx_fsq_pending            ON fhir_sync_queue(status, created_at)
                              WHERE status = 'pending'
idx_fsq_encounter          ON fhir_sync_queue(encounter_id)
```

### 5.2 자동 트리거 (2개)

| 트리거 | 동작 | 효과 |
|---|---|---|
| `_bump_updated_at()` | diagnostic_reports UPDATE 시 updated_at 자동 갱신 | 의사 수정 시각 추적 |
| `_fill_subject_id()` | modal_results, diagnostic_reports, modal_events INSERT 시 encounter_id로 subject_id 자동 채움 | 개발자 부담 ↓, MIMIC S3 조회 가속 |

### 5.3 무결성 제약

- **UNIQUE (encounter_id, modality) ON modal_results**
  → 같은 환자에 같은 모달은 1건만 (UPSERT 처리)

- **UNIQUE (encounter_id) ON diagnostic_reports**
  → 1 환자 = 1 소견서 (재생성 시 UPDATE)

- **FK ON DELETE CASCADE**
  → encounters 삭제 시 자식 4개 테이블 동시 삭제

---

## § 6. 데이터 흐름 — 쓰기/읽기 패턴

**[쓰기 POST/PUT]**
프론트 → FastAPI → **HAPI + central_db 양쪽 동시 INSERT**. encounter_id는 HAPI 발급 UUID를 central_db도 그대로 사용 (1:1 매핑). HAPI 실패 시 fhir_sync_queue로 자동 우회.

**[읽기 GET]**
프론트 → FastAPI → **central_db만 SELECT**. HAPI는 외부 EMR 연동 시점에만 GET. 프론트는 매 2초 polling으로 `/encounters/{eid}/modal-results`, `/timeline` 조회.

**이중 저장 이유**:
- HAPI = FHIR R4 표준화 + 미래 EMR 연동의 단일 통로
- central_db = 실시간 조회 + 모달 원본 보관 + Graceful Queue

---

## § 7. WebSocket 이벤트 (modal_events 10종)

백엔드 `broadcast()` 호출 시 (1) modal_events INSERT (영구 보관) + (2) WebSocket push (실시간) 동시 실행.

| event_type | 의미 |
|---|---|
| encounter_created | 트리아지 등록 완료 |
| order_placed | ServiceRequest 생성 |
| initial_proposal | AI 1차 권고 |
| modal_started | 모달 분석 시작 |
| modal_completed | 모달 분석 완료 |
| modal_failed | 모달 분석 실패 |
| next_proposal | AI 후속 권고 |
| ready_for_report | 종합 판단 준비 완료 |
| report_generated | 통합 소견서 생성 |
| report_signed | 의사 서명 / EMR 전송 |

---

## § 8. 벡터 DB — ChromaDB (RAG)

종합 소견서 생성 시 유사 환자 사례 검색은 별도 벡터 DB로 운영.

- **데이터**: MIMIC-IV 노트 49,743건 (363MB)
- **임베딩**: Bedrock Titan v2 (512 차원)
- **검색**: 코사인 유사도 + 다양성 필터 (discharge + radiology)
- **저장**: EC2 + EFS 마운트
- **향후**: S3 Vectors 또는 OpenSearch Serverless 마이그레이션 검토

---

## § 9. Aurora 운영 정책

### 9.1 ACU 설정

| Phase | MinCapacity | MaxCapacity | 근거 |
|---|---|---|---|
| Phase 1 (PoC) | 0.5 ACU | 2 ACU | MIMIC 데이터 + 테스트 |
| Phase 2 (운영) ★ | 0.5 ACU | 4 ACU | 일 100명 × 피크 동시 50쿼리 |
| Phase 3 (다병원) | 0.5 ACU | 8 ACU | Read Replica 추가 병행 |

### 9.2 백업 정책

```
PITR (Point-in-Time Recovery): 35일까지 5초 전 시점 복구
AWS Backup Vault Lock: 5년 보관 (S3 + KMS 암호화)
의료법 5년 보관 의무 충족
RPO: 5분 / RTO: 30초 이내 (Failover)
```

### 9.3 보안

- **aurora-sg**: 5432 inbound from central-sg, hapi-sg만 허용
- **NACL-Data**: ★ 인터넷 outbound 전면 차단 (데이터 유출 방지)
- **KMS** 저장 암호화 (Customer Managed Key)
- **SSL/TLS** 전송 암호화 강제 (`rds.force_ssl=1`)
- **DB 사용자 분리**:
    - `aurora-master` ← 응급 시에만, Secrets Manager 30일 rotation
    - `aurora-app-user` ← central_db 접근, 일상 운영
    - `hapi-db-user` ← hapi DB 접근, HAPI 전용

### 9.4 모니터링 알람

| 알람 이름 | 조건 | 알림 |
|---|---|---|
| aurora-acu-near-max | ACU > Max × 0.9 (10분) | Slack #운영 |
| aurora-acu-saturated | ACU == Max (5분) | Slack #응급 |
| aurora-connections-high | > 90% max_connections | Slack #운영 |
| aurora-deadlocks | > 0 (5분) | Slack #운영 |
| fhir-queue-backlog | pending > 50건 (10분) | Slack #운영 |
| fhir-queue-failed | failed > 0 (즉시) | Slack #응급 |

---

## § 10. 데이터베이스 구조 시각화

### 10.1 DB 계층 구조

```
                  Aurora Serverless v2 클러스터
              prod-aurora.cluster-xxxx:5432
                            │
              ┌─────────────┴─────────────┐
              ▼                            ▼
        ┌──────────┐                ┌──────────────┐
        │ hapi DB  │                │ central_db   │
        │ (Java)   │                │ (Python)     │
        └─────┬────┘                └──────┬───────┘
              │                            │
        public 스키마                   public 스키마
              │                            │
   ┌──────────┼──────────┐    ┌──────────┬─┴────────┬──────────┐
   ▼          ▼          ▼    ▼          ▼          ▼          ▼
Patient   Observation   DR   encounters modal_      diag_     modal_
Encounter Condition  +기타  +metadata   results    reports    events
SR        DocumentRef        JSONB     +raw_resp  +ai_rec   +payload
+Allergy +Med...                       JSONB(GIN) JSONB     JSONB
                                            │
                                            ▼
                                    fhir_sync_queue ★
                                    (Graceful Degradation)
```

### 10.2 central_db ERD — encounter_id 중심 연결

```
                  ┌──────────────────────────┐
                  │   encounters             │
                  │ ━━━━━━━━━━━━━━━━━━━━━━━━ │
                  │ ⚷ encounter_id TEXT PK   │
                  │   patient_id   TEXT      │
                  │   subject_id   VARCHAR   │ (자동 트리거 root)
                  │   chief_complaint TEXT   │
                  │   patient_name/age/gender│
                  │   started_at TIMESTAMPTZ │
                  │   closed_at  TIMESTAMPTZ │
                  │   status     VARCHAR     │
                  │ ★ metadata   JSONB       │
                  └────────────┬─────────────┘
                               │
        ┌──────────┬───────────┼────────────┬──────────────┐
       1:N         1:1         1:N           1:N
        │          │            │              │
        ▼          ▼            ▼              ▼
   ┌─────────┐ ┌────────┐  ┌──────────┐  ┌───────────────┐
   │modal_   │ │diag_   │  │modal_    │  │fhir_sync_     │ ★
   │results  │ │reports │  │events    │  │queue          │
   │─────────│ │────────│  │──────────│  │───────────────│
   │id PK    │ │id PK   │  │id PK     │  │id PK          │
   │enc_id FK│ │enc_id  │  │enc_id    │  │encounter_id   │
   │subject  │ │ UNIQUE │  │subject   │  │resource_type  │
   │modality │ │subject │  │event_type│  │resource_id    │
   │★raw_resp│ │fhir_   │  │★payload  │  │★payload JSONB │
   │ JSONB+  │ │ report │  │ JSONB    │  │status         │
   │ GIN     │ │ai_diag │  │created_at│  │retry_count    │
   │risk_    │ │★ai_rec │  │          │  │last_error     │
   │ level   │ │ JSONB  │  │          │  │created_at     │
   │summary  │ │risk    │  └──────────┘  │synced_at      │
   │created  │ │status  │                └───────────────┘
   │UNIQUE   │ │signed  │
   │(enc_id, │ │updated │
   │ modal)  │ └────────┘
   └─────────┘

⚷ PK    FK ON DELETE CASCADE    ★ JSONB    UNIQUE 제약
```

### 10.3 hapi DB ERD — FHIR R4 표준 (HAPI 자동 관리)

```
                       ┌──────────────┐
                       │  Patient     │
                       │ (HAPI UUID)  │
                       │  name        │
                       │  gender      │
                       │  birthDate   │
                       │  ← subject_id│
                       └──────┬───────┘
                              │ subject
                       ┌──────▼───────┐
                       │  Encounter   │
                       │  id ← cnt_db │ (central_db.encounter_id)
                       │  status      │
                       │  period      │
                       │  reasonCode  │
                       └──────┬───────┘
                              │ encounter (N:1)
       ┌──────────┬───────────┼────────────┬──────────────┐
       ▼          ▼           ▼            ▼              ▼
  ┌─────────┐┌─────────┐┌─────────┐┌──────────┐┌────────────────┐
  │Service  ││Observa- ││Condition││Document  ││ + 부가 리소스   │
  │Request  ││tion     ││         ││Reference ││ AllergyIntol-  │
  │─────────││─────────││─────────││──────────││ MedicationSt-  │
  │code:    ││code:    ││code:    ││content[].││ (트리아지에서   │
  │ ECG/CXR ││ LOINC   ││ ICD-10  ││attachment││  같이 저장)     │
  │ /LAB    ││value:   ││         ││.url      │└────────────────┘
  │status:  ││ Quantity││ severity││ ← S3 URL │
  │ draft→  ││         ││         ││          │
  │ active→ ││         ││         ││          │
  │ completed         │           │          │
  └─────────┘└─────────┘└─────────┘└──────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ DiagnosticReport │
                    │ ─────────────────│
                    │ status:          │
                    │  preliminary→    │
                    │  final           │
                    │ result[]         │
                    │ conclusion       │
                    │ (Claude narrative)│
                    └──────────────────┘

HAPI가 SQL 변환·저장·버전 관리·감사 로그 모두 자동 처리
```

### 10.4 S3 버킷 구조

```
┌─────────────────────────────────────────────────────────────────┐
│ ① s3://say1-pre-project-5/data/mimic-cxr-jpg/                   │
│    files/p{XX}/p{subject_id}/s{study_id}/{instance_id}.jpg      │
│    MIMIC-CXR-JPG 원본 (CXR 모달 다운로드)                        │
├─────────────────────────────────────────────────────────────────┤
│ ② s3://say2-6team/mimic/ecg/waveforms/                          │
│    files/p{XXXX}/p{subject_id}/s{study_id}/{record}.hea, .dat   │
│    MIMIC-IV-ECG 파형 데이터                                       │
├─────────────────────────────────────────────────────────────────┤
│ ③ s3://say2-6team/jeongin/                                      │
│    note_rag.zip ← ChromaDB 백업 (49,743건 임베딩)                │
│    Bedrock Titan v2 512차원 코사인 유사도 검색                    │
├─────────────────────────────────────────────────────────────────┤
│ ④ s3://say6-prod-backup/ (Phase 2 운영)                         │
│    aurora-snapshots/... ← AWS Backup Vault Lock 5년 + KMS       │
├─────────────────────────────────────────────────────────────────┤
│ ⑤ s3://say6-prod-archive/ (장기 보관)                            │
│    encounters-{year}/... ← 5년 지난 데이터 Glacier 자동 이전     │
└─────────────────────────────────────────────────────────────────┘

원칙: 비정형(이미지·파형)은 S3, 메타데이터(URL)는 PostgreSQL
      subject_id가 양쪽 경로의 핵심 키 → 트리거가 자동 입력
```

### 10.5 데이터 흐름 — 한 환자 등록 9단계

```
① 프론트 트리아지 제출
   POST /triage/submit
   { subject_id: '15638163', chief_complaint: '흉통' }
                │
                ▼
② 백엔드 Orchestrator → HAPI
   Patient INSERT → patient_id='pat-aaa'
   Encounter INSERT → encounter_id='enc-bbb'
   ServiceRequest INSERT × 2 (ECG, LAB)
                │
                ▼
③ Orchestrator → central_db
   INSERT INTO encounters (encounter_id='enc-bbb', ...)
                │
                ▼
④ 모달 호출 (ECG + LAB 병렬, Cloud Map DNS)
                │
                ▼
⑤ ECG Modal — S3 원본 다운로드 (subject_id 경로)
                │
                ▼
⑥ Modal 추론 결과 응답 (JSON)
                │
                ▼
⑦ central_db.modal_results INSERT
   encounter_id='enc-bbb', subject_id=auto trigger,
   modality='ECG', raw_response=JSONB, risk_level='urgent'
                │
                ▼
⑧ modal_events INSERT (이벤트 로그)
   event_type='modal_completed'
                │
                ▼
⑨ Bedrock Claude — 종합 소견서
   ChromaDB RAG 유사 사례 검색 → Claude Sonnet narrative
   → diagnostic_reports INSERT (UNIQUE encounter_id)
   → HAPI DiagnosticReport 동기화 (실패 시 fhir_sync_queue 적재)

병렬: WebSocket 이벤트 push — 모든 단계에서 broadcast()
프론트: 매 2초 GET /encounters/{eid}/timeline 폴링
```

### 10.6 ERD 핵심 규칙 요약

| 항목 | 규칙 |
|---|---|
| Primary Key | `encounters.encounter_id` (HAPI 발급 UUID), 나머지 4개 테이블 `id BIGSERIAL` |
| Foreign Key | 자식 4개 테이블 → `encounters.encounter_id` ON DELETE CASCADE |
| UNIQUE 제약 | `modal_results(encounter_id, modality)` / `diagnostic_reports(encounter_id)` |
| subject_id 비정규화 | 5개 테이블 모두에 추가, 트리거 자동 입력, MIMIC S3 매핑·환자 단위 분석 |
| 자동 트리거 | `_fill_subject_id()` INSERT 시 / `_bump_updated_at()` UPDATE 시 |
| 인덱스 | 총 17개 (encounters 3 + modal_results 6 + diag 3 + events 3 + queue 2) |
| JSONB 컬럼 | 4종 (metadata, raw_response+GIN, ai_recommendations, payload) |
| 외부 스토리지 | CXR→S3 / ECG→S3 / RAG→ChromaDB+EFS / 백업→S3 Vault Lock 5년 |

### 10.7 테이블 관계 Cardinality

| 관계 | 카디널리티 | 설명 |
|---|---|---|
| encounters ─ modal_results | 1 : N | 모달당 1건 UNIQUE (최대 4종) |
| encounters ─ diagnostic_reports | 1 : 1 | 한 방문 = 1 소견서 |
| encounters ─ modal_events | 1 : N | 평균 10~30건 이벤트 |
| encounters ─ fhir_sync_queue | 1 : N | HAPI 다운 시에만 적재 |
| subject_id ─ encounters | 1 : N | 한 환자가 여러 번 방문 |
| subject_id ─ S3 데이터 | M : N | 같은 환자의 여러 study |

### 10.8 1-페이지 아키텍처 요약

```
                    프론트엔드 (React / Vite)
                            │
                    REST · JSON · WebSocket
                            ▼
                    ECS Orchestrator
                    FastAPI · asyncpg · httpx
                    Cloud Map · WebSocket broadcast · KMS
                            │
   ┌──────────┬──────────┬──┴─────────┬──────────┬──────────┐
   ▼          ▼          ▼            ▼          ▼          ▼
┌──────┐ ┌─────────┐ ┌──────────┐ ┌───────┐ ┌─────────┐ ┌────────┐
│HAPI  │ │central_ │ │Bedrock   │ │ S3    │ │ChromaDB │ │Modal   │
│FHIR  │ │db       │ │          │ │       │ │(RAG)    │ │ECS     │
│Java  │ │Python   │ │Claude    │ │CXR    │ │MIMIC    │ │ecg/cxr │
│JDBC  │ │asyncpg  │ │Sonnet/   │ │ECG    │ │note     │ │/lab    │
│      │ │         │ │Haiku     │ │backup │ │49,743   │ │.local  │
│9 리소스│ │5 테이블 │ │Titan v2  │ │archive│ │512차원  │ │병렬    │
└──────┘ └─────────┘ └──────────┘ └───────┘ └─────────┘ └────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
    Graceful         자동 트리거
    Queue            (subject_id,
    (HAPI 다운       updated_at)
     자동 백필)
```

**핵심 약속**:
- Aurora Serverless v2 클러스터 1개 (DB 2개 동일하게 운영)
- PK 통일: `encounter_id` (HAPI 발급) ← central_db 모든 테이블이 FK 참조
- 보조 키: `subject_id` (MIMIC) ← S3 원본 분석, 트리거 `_fill_subject_id()` 자동
- JSONB: AI 모달 결과 유연 저장 (`raw_response` + GIN 인덱스)
- Graceful Degradation: `fhir_sync_queue` + 5분 Retry Worker
- 백업: AWS Backup Vault Lock 5년 (PITR 35일 + KMS 암호화)
- 비용: Phase 1 ~$45/월 (0.5 ACU) → Phase 2 ~$280/월 (Auto Scale + Vault Lock)

---

## § 11. 운영 비용

| 항목 | Phase 1 (PoC) | Phase 2 (운영) | 비고 |
|---|---|---|---|
| Aurora SLv2 컴퓨트 | ~$45 | ~$220 | 0.5 ACU → 0.5~4 ACU 자동 |
| 스토리지 | ~$15 | ~$30 | 10GB 단위 자동 확장 |
| AWS Backup Vault Lock | — | ~$30 | 5년 보관 + KMS |
| ElastiCache Redis | — | ~$50 | (선택, Task 확장 시) |
| **합계** | **~$60/월** | **~$330/월** | DB 레이어 전체 |

---

## § 12. 핵심 요약

| 항목 | 결정 사항 | 근거 |
|---|---|---|
| DB 엔진 | PostgreSQL | HAPI FHIR + JSONB |
| DB 서비스 | ★ Aurora Serverless v2 | 자동 스케일 + 폭증 대응 |
| 클러스터 구조 | 1 클러스터 / DB 2개 | 비용 절감 (월 $220 vs $440) |
| JSON 저장 | JSONB + GIN 인덱스 | AI 모달 결과 유연 저장 |
| 이미지 저장 | S3 + URL을 DB 기록 | 대용량 파일 분리 |
| Graceful Degradation | fhir_sync_queue + Retry Worker | HAPI 1대 운영 가능 |
| 데이터 보관 | ★ 5년 전량 (Aurora 내) | 의료법 + 의사 즉시 조회 |
| 백업 전략 | ★ AWS Backup Vault Lock 5년 + KMS | 재해복구 + 컴플라이언스 |
| RPO / RTO | 5분 / 30초 | PITR + Auto Failover |

### 발표 한 줄 메시지

> "Aurora Serverless v2 클러스터 1개에 HAPI FHIR 표준 DB와 우리 운영 DB를 분리해서, HAPI에는 FHIR R4 표준 리소스 9종을, 운영 DB에는 빠른 폴링용 5 테이블(encounters · modal_results · diagnostic_reports · modal_events · **fhir_sync_queue**)을 운영합니다. 모든 테이블은 HAPI가 발급한 encounter_id를 FK로 연결하고, MIMIC 매핑용 subject_id 비정규화 컬럼이 트리거로 자동 입력되어 S3 원본 데이터 조회와 환자 단위 분석을 가속합니다. AI 모달의 가변 응답은 JSONB + GIN 인덱스로 저장하며, HAPI 장애 시 fhir_sync_queue가 자동 적재되어 임상 무중단을 보장합니다."

---

*문서 끝*
