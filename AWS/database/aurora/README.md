# Aurora Serverless v2 — DB 설계

> **이 폴더가 하는 일**: DRAI 시스템의 AWS Aurora Serverless v2 데이터베이스 설계를 문서화한다.
> 실제 배포 시 `migrations.yaml`의 SQL을 순서대로 실행하면 DB가 구성된다.

---

## 이 시스템에서 DB가 왜 2개인가?

DRAI는 의료 표준(FHIR)을 준수하면서 AI 추론 결과도 보존해야 한다.
이 두 가지 요구사항이 충돌하기 때문에 DB를 역할별로 분리했다.

```
┌─────────────────────────────────────────────────────────┐
│           Aurora Serverless v2 클러스터                   │
│              (say2-6team-aurora-cluster)                      │
│                                                         │
│   ┌─────────────────┐      ┌─────────────────┐         │
│   │    drai_ops     │      │      hapi        │         │
│   │   (운영 DB)      │      │   (FHIR DB)      │         │
│   │                 │      │                  │         │
│   │ • encounters    │      │ HAPI FHIR 서버가  │         │
│   │ • modal_results │      │ 자동으로 생성/관리  │         │
│   │ • diagnostic_   │      │ (Patient, Obs,   │         │
│   │   reports       │      │  Encounter 등    │         │
│   │ • modal_events  │      │  FHIR R4 리소스) │         │
│   └────────┬────────┘      └────────┬─────────┘         │
│            │                        │                   │
│            ▼                        ▼                   │
│      중앙백엔드가 직접 접근      HAPI FHIR 서버만 접근       │
└─────────────────────────────────────────────────────────┘
```

| DB | 무엇을 저장하나 | 누가 접근하나 | 왜 분리했나 |
|---|---|---|---|
| `drai_ops` | AI 추론 원본 JSON, 소견서, WebSocket 이벤트 | 중앙백엔드 (FastAPI) | AI 결과를 FHIR로 변환하면 구조가 손실됨 |
| `hapi` | 환자 정보, 바이탈, 검사 오더 (FHIR 표준) | HAPI FHIR 서버 | 의료 표준 준수, 병원 시스템 연동 |

---

## 파일 구조

```
aurora-serverless/
├── README.md             ← 지금 읽고 있는 파일 (전체 개요)
├── GUIDE.md              ← 상세 설명서 (요금 계산, 각 옵션 설명)
├── aurora-stack.yaml     ⭐ 정식 CloudFormation 템플릿 (그대로 배포)
│                            KMS · Secrets Manager · SG · Subnet Group · 클러스터 · writer + reader
├── schema.yaml           ← drai_ops(central_db) DB 테이블 구조 문서 (참고용)
├── migrations.yaml       ← 실제 실행할 SQL (001~009 순서대로)
└── _archive/             ← 옛 설계 yaml (참고용, 배포 안 함)
    ├── aurora-cluster.yaml   (현재는 aurora-stack.yaml 로 흡수됨)
    └── security.yaml         (현재는 aurora-stack.yaml 로 흡수됨)
```

> 💡 **배포에 쓸 파일은 `aurora-stack.yaml` 하나**입니다.
> 옛 `aurora-cluster.yaml` + `security.yaml` 은 설계 의도를 보존하기 위해 `_archive/` 에 남겨뒀어요.

---

## drai_ops 테이블 6개 — 한눈에 보기

| 테이블 | 역할 | 언제 생성되나 |
|--------|------|-------------|
| `encounters` | 응급실 방문 1건 기록 | 트리아지 접수 시 |
| `modal_results` | ECG/CXR/Lab AI 추론 원본 응답 | 모달 분석 완료 시 |
| `diagnostic_reports` | AI 종합 소견 + 의사 서명 | 리포트 생성 시 |
| `modal_events` | WebSocket 이벤트 로그 | 실시간 이벤트 발생 시 |
| `fhir_sync_queue` | HAPI 동기화 백로그 (Graceful Degradation) | HAPI 다운 시 backfill 대비 |
| `device_tokens` | 모바일 푸시 알림 토큰 (FCM/APNs/Web Push) | Flutter 앱 시작 시 |

### 테이블 관계도

```
encounters (방문 1건)
    │  encounter_id (TEXT = FHIR Encounter ID)
    │
    ├──→ modal_results       (ECG/CXR/Lab 결과, 방문당 모달 1개씩)
    ├──→ diagnostic_reports  (소견서, 방문당 1개)
    └──→ modal_events        (이벤트 로그, 여러 개)

fhir_sync_queue (FK 없음, encounter_id로만 추적)
    └─ retry worker가 5분마다 pending row 백필

device_tokens (FK 없음 — 환자가 아닌 의사 단말)
    └─ user_id로 사용자 매칭, token UNIQUE
```

---

## 데이터 흐름 (환자 1명 처리 과정)

```
1. 간호사가 트리아지 입력
        │
        ▼
2. HAPI FHIR에 Patient + Encounter 생성 (hapi DB)
   drai_ops.encounters에도 방문 레코드 생성
        │
        ▼
3. AI가 모달 추천 → 의사 승인 → 모달 실행
   (ECG → Lab → CXR 순서는 증상에 따라 다름)
        │
        ▼
4. 각 모달 결과 → drai_ops.modal_results에 JSONB로 저장
   (raw_response에 원본 전체 보존 → Bedrock 종합 판단 시 그대로 투입)
        │
        ▼
5. WebSocket 이벤트 → drai_ops.modal_events에 로그
        │
        ▼
6. Bedrock Claude가 모든 모달 결과 종합
   → drai_ops.diagnostic_reports 생성 (preliminary)
        │
        ▼
7. 의사가 소견 확인/수정 후 서명
   → status: 'signed', signed_by, signed_at 기록
```

---

## 배포 방법

### 1단계: 사전 조건 — network 스택 먼저 배포
```bash
aws cloudformation deploy \
  --stack-name say2-6team-network \
  --template-file ../network/network-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM
```

### 2단계: Aurora 스택 한 번에 배포
```bash
aws cloudformation deploy \
  --stack-name say2-6team-aurora \
  --template-file aurora-stack.yaml \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides \
      ProjectName=say2-6team \
      Environment=dev \
      Owner=yji
```

→ KMS 키, Secrets Manager(master 비번 자동 생성), Security Group, Subnet Group, 클러스터, writer+reader 인스턴스 모두 자동 생성. 약 10~15분 소요.

### 3단계: DB 초기화
`migrations.yaml`의 SQL을 001부터 순서대로 실행:
```bash
psql -U admin -d drai_ops -f schema.sql
# 또는 docker-entrypoint-initdb.d/ 에 넣어 자동 실행
```

> **참고**: `migrations.yaml`의 SQL은 `final/central/backend/app/db/schema.sql`과 동일하다.

---

## 비용 요약

| 사용 패턴 | 월 예상 비용 |
|----------|:-----------:|
| 데모 (하루 1~2시간) | ~$4 |
| 개발 (하루 8시간) | ~$24 |
| 프로덕션 (24시간) | ~$273 |

자세한 비용 계산은 `GUIDE.md` 참고.
