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
│              (drai-aurora-cluster)                      │
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
├── README.md           ← 지금 읽고 있는 파일 (전체 개요)
├── GUIDE.md            ← 상세 설명서 (요금 계산, 각 옵션 설명)
├── aurora-cluster.yaml ← AWS Aurora 클러스터 인프라 설정
├── schema.yaml         ← drai_ops DB 테이블 구조 정의
├── security.yaml       ← 네트워크/암호화/접근 제어 설정
└── migrations.yaml     ← 실제 실행할 SQL (001~006 순서대로)
```

---

## drai_ops 테이블 4개 — 한눈에 보기

| 테이블 | 역할 | 언제 생성되나 |
|--------|------|-------------|
| `encounters` | 응급실 방문 1건 기록 | 트리아지 접수 시 |
| `modal_results` | ECG/CXR/Lab AI 추론 원본 응답 | 모달 분석 완료 시 |
| `diagnostic_reports` | AI 종합 소견 + 의사 서명 | 리포트 생성 시 |
| `modal_events` | WebSocket 이벤트 로그 | 실시간 이벤트 발생 시 |

### 테이블 관계도

```
encounters (방문 1건)
    │  encounter_id (TEXT = FHIR Encounter ID)
    │
    ├──→ modal_results      (ECG/CXR/Lab 결과, 방문당 모달 1개씩)
    ├──→ diagnostic_reports (소견서, 방문당 1개)
    └──→ modal_events       (이벤트 로그, 여러 개)
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

### 1단계: Aurora 클러스터 생성
`aurora-cluster.yaml`을 참고해 AWS 콘솔 또는 CLI로 클러스터 생성.

### 2단계: 보안 설정
`security.yaml`을 참고해 VPC, Security Group, Secrets Manager, IAM 설정.

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
