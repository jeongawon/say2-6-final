# Aurora Serverless v2 — 상세 설명서

> **대상 독자**: 이 프로젝트를 처음 접하는 팀원, 또는 AWS DB 설정을 담당하는 DevOps
> **전제 지식**: AWS 기본 개념 (VPC, EC2, S3), PostgreSQL 기초

---

## 목차

1. [Aurora Serverless v2란?](#1-aurora-serverless-v2란)
2. [각 YAML 파일 설명](#2-각-yaml-파일-설명)
3. [요금 계산](#3-요금-계산)
4. [DB 선택 비교 (왜 Aurora인가)](#4-db-선택-비교)
5. [주요 설정 옵션 해설](#5-주요-설정-옵션-해설)

---

## 1. Aurora Serverless v2란?

### 일반 RDS와 뭐가 다른가

일반 RDS는 서버 크기를 미리 정해야 한다. `db.t3.micro`를 선택하면 아무도 안 써도 월 $15가 나간다.

Aurora Serverless v2는 **사용한 만큼만 과금**된다. 아무도 안 쓰면 최소 용량(0.5 ACU)으로 줄어들어 거의 0원에 가깝다.

```
일반 RDS:
  트래픽 없음 ──→ 서버 계속 켜짐 ──→ 비용 계속 발생

Aurora Serverless v2:
  트래픽 없음 ──→ 0.5 ACU로 축소 ──→ 비용 거의 0
  트래픽 급증 ──→ 자동으로 4 ACU까지 확장 ──→ 응급 상황 대응
```

### ACU가 뭔가

Aurora Capacity Unit. 컴퓨팅 자원의 단위다.

| ACU | RAM | 동시 접속 | 적합한 상황 |
|:---:|:---:|:--------:|------------|
| 0.5 | ~1GB | ~10명 | 유휴/데모 |
| 1.0 | ~2GB | ~50명 | 개발/테스트 |
| 2.0 | ~4GB | ~200명 | 소규모 운영 |
| 4.0 | ~8GB | ~500명 | 2차 병원 피크 |

---

## 2. 각 YAML 파일 설명

### `aurora-cluster.yaml` — 클러스터 인프라 설정

Aurora 클러스터 자체의 설정이다. 어떤 엔진을 쓸지, 어느 VPC에 배치할지, 백업은 어떻게 할지를 정의한다.

| 섹션 | 무엇을 설정하나 | 핵심 값 |
|------|--------------|--------|
| `cluster.engine` | DB 엔진 종류 | aurora-postgresql 16.4 |
| `cluster.databases` | 이 클러스터에서 운영할 DB 목록 | drai_ops, hapi |
| `serverless_v2` | 자동 스케일링 범위 | min 0.5 ACU ~ max 4.0 ACU |
| `vpc` | 어느 네트워크에 배치할지 | Private Subnet (외부 접근 차단) |
| `encryption` | 디스크 암호화 | KMS AES-256 |
| `backup` | 자동 백업 설정 | 7일 보관, 매일 03:00 UTC |
| `instances` | 인스턴스 구성 | Writer 1개 + Reader 1개 |

**Writer vs Reader 인스턴스**:
- Writer: 읽기/쓰기 모두 처리. 장애 시 Reader가 자동으로 Writer로 승격
- Reader: 읽기 전용. 조회 트래픽 분산 + 고가용성 보장
- 데모 단계에서는 Writer만 써도 충분 (Reader 제거 시 월 ~$86 절감)

---

### `schema.yaml` — 테이블 구조 정의

`drai_ops` DB의 6개 테이블을 문서화한다.
실제 SQL은 `migrations.yaml`에 있고, 이 파일은 사람이 읽기 쉬운 형태로 정리한 것이다.

> ⚠️ **주의**: `schema.yaml`에 표기된 허용 값 목록(예: `'active' | 'closed'`)은
> 문서화 목적이다. 실제 DB에는 CHECK 제약이 없으며, 값 검증은 애플리케이션 코드에서 한다.

**테이블별 핵심 설계 결정**:

**encounters** — FHIR ID를 PK로 그대로 사용
```
encounter_id: TEXT (UUID 변환 없이 FHIR Encounter ID 그대로)
→ HAPI FHIR와 1:1 매핑이 쉬워짐
```

**modal_results** — AI 결과를 JSONB 원본으로 보존
```
raw_response: JSONB (모달 서비스가 반환한 PredictResponse 전체)
→ ECG는 24개 질환 확률, Lab은 수치 플래그, CXR은 6개 질환 — 모달마다 구조가 다름
→ JSONB로 저장하면 스키마 변경 없이 유연하게 대응
→ Bedrock 종합 판단 시 원본 그대로 투입 (변환 시 정보 손실 방지)
UNIQUE(encounter_id, modality) → 1 방문당 모달 1개 결과만 (재실행 시 UPSERT)
```

**diagnostic_reports** — 1 방문 = 1 소견서
```
UNIQUE(encounter_id) → 소견서 중복 방지
status: preliminary → signed → amended
physician_edits: 의사가 AI 소견을 수정한 내용
```

**modal_events** — WebSocket 이벤트 로그
```
event_type: initial_proposals, modal_completed, ready_for_report 등
payload: JSONB (이벤트 전체 내용)
→ 디버깅 및 이벤트 재전송 대비
```

**트리거 2개**:
- `_fill_subject_id()`: encounter_id로 INSERT 시 encounters 테이블에서 subject_id 자동 조회해 채움
- `_bump_updated_at()`: diagnostic_reports UPDATE 시 updated_at 자동 갱신

---

### `security.yaml` — 보안 설정

3계층 보안 전략을 정의한다.

```
Layer 1: 네트워크 격리
  → VPC Private Subnet에 배치 (인터넷에서 직접 접근 불가)
  → Security Group으로 중앙백엔드 + HAPI FHIR만 5432 포트 허용

Layer 2: 인증/인가
  → Secrets Manager에 DB 비밀번호 저장 (코드에 하드코딩 금지)
  → 30일마다 자동 로테이션
  → IAM 역할 기반 인증 (비밀번호 없이 토큰으로 접속)

Layer 3: 암호화
  → 저장 시: KMS AES-256 (디스크 암호화)
  → 전송 시: TLS 강제 (클라이언트 ↔ DB 구간)
```

**DB 사용자 4종**:

| 사용자 | 접근 DB | 권한 | 용도 |
|--------|--------|------|------|
| `admin` | 전체 | superuser | DDL 작업 전용 — 운영 중 사용 금지 |
| `app_user` | drai_ops | SELECT/INSERT/UPDATE/DELETE | 중앙백엔드 애플리케이션 |
| `hapi_user` | hapi | ALL | HAPI FHIR 서버 전용 |
| `readonly_user` | drai_ops | SELECT | 모니터링/분석 |

---

### `migrations.yaml` — 실행 SQL

실제 DB에 적용할 SQL을 버전 순서대로 담고 있다.

| 버전 | 내용 |
|------|------|
| 001 | encounters 테이블 생성 |
| 002 | modal_results 테이블 생성 (GIN 인덱스 포함) |
| 003 | diagnostic_reports 테이블 생성 |
| 004 | modal_events 테이블 생성 |
| 005 | `_bump_updated_at()` 트리거 |
| 006 | `_fill_subject_id()` 트리거 (3개 테이블 적용) |
| 007 | fhir_sync_queue 테이블 생성 (HAPI Graceful Degradation 큐) |
| 008 | device_tokens 테이블 생성 (모바일 푸시 알림) |

> 이 SQL은 `final/central/backend/app/db/schema.sql`과 **100% 동일**하다.
> YAML 형식은 버전 관리와 문서화를 위한 래퍼다.

---

## 3. 요금 계산

### 과금 공식

```
월 비용 = (ACU 사용량 × $0.12/ACU-시간)
        + (스토리지 GB × $0.10/GB-월)
        + (I/O 백만 건 × $0.20)
```

### 시나리오별 예상 비용 (서울 리전 ap-northeast-2)

#### 데모/PoC — 하루 1~2시간만 사용

| 항목 | 계산 | 월 비용 |
|------|------|:-------:|
| ACU (0.5 × 2시간 × 30일) | 30 ACU-시간 × $0.12 | $3.60 |
| 스토리지 1GB | | $0.10 |
| I/O 10만 건 | | $0.02 |
| Secrets Manager | | $0.40 |
| **합계** | | **~$4/월** |

#### 개발 환경 — 하루 8시간 사용

| 항목 | 계산 | 월 비용 |
|------|------|:-------:|
| ACU (1.0 × 8시간 × 22일) | 176 ACU-시간 × $0.12 | $21.12 |
| 스토리지 5GB | | $0.50 |
| I/O 100만 건 | | $0.20 |
| Secrets Manager + Enhanced Monitoring | | $2.40 |
| **합계** | | **~$24/월** |

#### 프로덕션 — 24시간 운영 (2차 병원 1개소)

| 항목 | 계산 | 월 비용 |
|------|------|:-------:|
| Writer (평균 2.0 ACU × 24h × 30일) | 1,440 × $0.12 | $172.80 |
| Reader (평균 1.0 ACU × 24h × 30일) | 720 × $0.12 | $86.40 |
| 스토리지 50GB | | $5.00 |
| I/O 1,000만 건 | | $2.00 |
| 백업 50GB | | $1.05 |
| Secrets Manager + Monitoring | | $6.00 |
| **합계** | | **~$273/월** |

### 비용 절감 방법

| 방법 | 절감 효과 | 언제 적용 |
|------|:--------:|----------|
| Reader 인스턴스 제거 | ~$86/월 | 데모 (고가용성 불필요 시) |
| min_acu 0.5 유지 | 유휴 시 최소화 | 항상 |
| 백업 보관 3일로 축소 | 소폭 절감 | 데모 |
| Aurora 완전 중지 | 0원 (7일 제한) | 사용 안 할 때 |

---

## 4. DB 선택 비교

### Aurora Serverless v2 vs 일반 RDS vs DynamoDB

| 항목 | Aurora Serverless v2 | 일반 RDS PostgreSQL | DynamoDB |
|------|:---:|:---:|:---:|
| 엔진 | PostgreSQL 호환 | PostgreSQL | NoSQL |
| 스케일링 | 자동 (초 단위) | 수동 | 자동 |
| 데모 최소 비용 | **~$4/월** | ~$15/월 | ~$1/월 |
| SQL / JOIN | ✅ | ✅ | ❌ |
| JSONB 지원 | ✅ | ✅ | ✅ (네이티브) |
| FHIR 서버 호환 | ✅ | ✅ | ❌ |
| FK 제약 / 트랜잭션 | ✅ ACID | ✅ ACID | 제한적 |
| 유휴 시 비용 | 거의 0 | 계속 발생 | 0 |

### Aurora를 선택한 이유

```
1. HAPI FHIR 서버가 PostgreSQL 백엔드를 필요로 함
2. modal_results의 raw_response를 JSONB로 저장 → GIN 인덱스로 빠른 검색
3. encounters → modal_results FK 제약으로 데이터 무결성 보장
4. UNIQUE(encounter_id, modality) 제약으로 중복 방지
5. 데모 단계 비용이 일반 RDS보다 저렴 (유휴 시 거의 0)
```

### DynamoDB를 쓰지 않는 이유

초기 설계(`DB-Architecture.md`)에서는 modal_results를 DynamoDB에 저장하는 방안을 검토했다.
최종 구현에서 Aurora 단독으로 결정한 이유:

- FK 제약 필요: `modal_results → encounters` 참조 무결성
- UNIQUE 제약 필요: `(encounter_id, modality)` 중복 방지
- ON DELETE CASCADE: encounter 삭제 시 관련 데이터 자동 정리
- 단일 트랜잭션: 여러 테이블 동시 쓰기 시 일관성 보장
- 관리 단순화: DB 1개 클러스터로 통합

---

## 5. 주요 설정 옵션 해설

### `serverless_v2.min_acu` / `max_acu`

```yaml
serverless_v2:
  min_acu: 0.5   # 아무도 안 쓸 때 이 값으로 줄어듦
  max_acu: 4.0   # 피크 시 이 값까지 자동 확장
```

min을 너무 낮게 설정하면 첫 요청 시 워밍업 시간이 생길 수 있다.
응급 의료 시스템 특성상 min 1.0 이상을 권장한다 (프로덕션 기준).

---

### `encryption`

```yaml
encryption:
  at_rest:
    enabled: true          # 디스크에 저장된 데이터 AES-256 암호화
  in_transit:
    ssl_mode: require      # 클라이언트 ↔ DB 간 TLS 강제
```

의료 데이터(PHI)는 반드시 둘 다 활성화해야 한다. HIPAA 및 국내 의료법 요구사항.
비용: AWS 관리형 KMS 키 사용 시 무료. 고객 관리형 키는 $1/월/키.

---

### `backup.retention_days`

```yaml
backup:
  retention_days: 7        # 7일치 자동 백업 보관
  preferred_window: "03:00-04:00"  # UTC 기준 (KST 12:00-13:00)
```

범위: 1~35일. 클러스터 스토리지 크기까지는 무료, 초과분 $0.021/GB-월.
데모에서는 3일로 줄여도 된다.

---

### `instances` — Writer + Reader 구성

```yaml
instances:
  - identifier: say2-6team-writer
    promotion_tier: 0      # Primary (읽기/쓰기)
  - identifier: say2-6team-reader
    promotion_tier: 1      # Replica (읽기 전용, 장애 시 자동 승격)
```

| 구성 | 장애 시 | 비용 | 추천 |
|------|--------|:----:|------|
| Writer만 | 수동 복구 필요 | 1× | 데모/개발 |
| Writer + Reader | 자동 페일오버 (~30초) | ~1.5× | 프로덕션 |

---

### `pgaudit` — DB 쿼리 감사 로그

```yaml
pgaudit_settings:
  log_level: write         # INSERT/UPDATE/DELETE만 기록 (SELECT 제외)
  log_parameter: true      # 쿼리에 전달된 값도 로그에 포함
```

의료법상 환자 데이터 접근/변경 이력을 6년간 보관해야 한다.
pgaudit를 활성화하면 Aurora PostgreSQL 로그에 모든 DML이 기록되고,
CloudWatch Logs로 전송되어 장기 보관된다.

---

## 전체 시스템에서 Aurora의 위치

```
사용자 (의사/간호사)
        │ HTTPS
        ▼
  CloudFront + ALB
        │
        ▼
  중앙백엔드 (FastAPI, ECS Fargate)
  ┌─────────────────────────────────────────┐
  │ • 트리아지 접수 → HAPI FHIR에 Patient 생성 │
  │ • 모달 호출 → modal_results에 결과 저장    │
  │ • Bedrock 종합 → diagnostic_reports 생성 │
  │ • WebSocket → modal_events에 로그        │
  └──────┬──────────────┬────────────────────┘
         │              │
         ▼              ▼
   HAPI FHIR        SageMaker / Lab 서비스
   (hapi DB)        (ECG / CXR / Lab 추론)
         │
         ▼
  ★ Aurora Serverless v2 ★
  ┌──────────────┬──────────────┐
  │  drai_ops    │    hapi      │
  │  (우리 코드)  │  (FHIR 자동) │
  └──────────────┴──────────────┘
```

---

**문서 버전**: v1.2
**최종 수정**: 2026-05-14
**기반 파일**: `final/central/backend/app/db/schema.sql`
