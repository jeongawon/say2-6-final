# 응급의료 AI 진단보조 시스템 컴퓨팅 영역 설계 문서

**AWS 아키텍처 운영 컴퓨팅 가이드 v1.0**

---

## § 1. 컴퓨팅 자원 구성 개요

```
ECS Cluster: medical-ai-cluster
─────────────────────────────────────────────────────────────────────
런타임: Fargate (서버리스 컨테이너)
이유: ─ 서버 관리 부담 0 (AWS가 호스트 OS·패치·하드웨어 관리)
       ─ CPU 추론 (LightGBM/XGBoost/ONNX) → GPU 불필요
       ─ Task 단위 격리 (모달 간 라이브러리 충돌 차단)

베이스라인 컨테이너: 8개 (Service 4 × Task 2)
Auto Scaling 최대: 20개

HAPI FHIR: EC2 t4g.medium 단일 인스턴스 (별도 § 5 참조)
```

---

## § 2. ECS Service 4개 구성

> ★ 각 서비스별 Task 2개 = Container 2개

**ECS에서 Task = Container 1개 (마이크로서비스 패턴)**

```
  Service 1개
     │
     ├─ Task 1 (= Container 1개) ─ AZ-a
     │
     └─ Task 2 (= Container 1개) ─ AZ-c
```

| Service | vCPU/Mem | Tasks | AZ 분포 | Auto Scaling |
|---|---|---|---|---|
| orchestrator | 1 / 2GB | 2 | a + c | min 2 / max 4 |
| ecg-svc | 2 / 4GB | 2 | a + c | min 2 / max 6 |
| cxr-svc | 4 / 8GB | 2 | a + c | min 2 / max 6 |
| lab-svc | 1 / 2GB | 2 | a + c | min 2 / max 4 |

- **총 baseline**: 4 Service × 2 Task = **8 Task = 8 Container**
- **Auto Scaling 최대**: 4 + 6 + 6 + 4 = **20 Task**

---

## § 3. 왜 서비스별 Task 2개인가 — HA 베이스라인

- **Task 1개** = AZ 1곳만 존재 → AZ 장애 시 서비스 다운
- **Task 2개 (서로 다른 AZ)** = 한쪽 AZ 죽어도 다른 AZ Task가 받음

응급 의료 시스템 = 가용성 최우선 → 모든 모달 최소 2 Task

### AZ-a 장애 시나리오

```
ecg-svc Task 1 ─ AZ-a 💀 ──→ ALB가 자동으로 Task 2로 라우팅
ecg-svc Task 2 ─ AZ-c ✓ ──→ 무중단 + Task 1을 다른 AZ에 자동 재생성
```

---

## § 4. 서비스 분리 4대 이유

1. **기술 스택 충돌 방지**
   PyTorch (ECG) + XGBoost (LAB) + ONNX (CXR) 라이브러리 격리

2. **독립 스케일링**
   ECG 트래픽 폭주 → ECG만 늘림, LAB/CXR 영향 X

3. **장애 격리**
   CXR 다운 → ECG/LAB은 정상, 임상 흐름 유지

4. **독립 배포**
   CXR 모델 교체 시 CXR Service만 Rolling Update, 다른 모달 다운타임 0

---

## § 5. HAPI FHIR — 왜 ECS가 아니라 EC2 1대인가

**EC2 t4g.medium 단일 인스턴스 (2 vCPU / 4 GB / ~$25/월)**

| 판단 기준 | ECS Fargate | EC2 (★ 선택) |
|---|---|---|
| 트래픽 변동성 | Auto Scaling 가능 | ER FHIR 안정적, 불필요 |
| JVM warmup | Task 뜰 때마다 30~60s | 장기 가동 JIT 최적화 |
| 시간당 비용 | 1vCPU/2GB ≈ $120/월 | ≈ $25/월 (가성비 5배) |
| 운영 부담 | AWS가 다 함 | Graceful Queue 안전망 |

### ★ HAPI는 1대로 충분 (Multi-AZ X)

- Graceful Degradation으로 HAPI 다운 시 `fhir_sync_queue` 자동 적재
- HAPI 복구 시 5분 주기 Retry Worker가 자동 백필 (TEST 검증 완료)
- 즉 **HAPI 1대 다운 = 임상 영향 0**
- ASG self-healing 미사용 (Graceful Queue가 1차 안전망)

---

## § 6. Auto Scaling 정책

### Target Tracking (CPU 기반)

| 항목 | 값 |
|---|---|
| 지표 | ECSServiceAverageCPUUtilization |
| Target | orchestrator/lab 60%, ecg/cxr 70% |
| Scale-out cooldown | 60초 (빠르게 늘려야 함) |
| Scale-in cooldown | 300초 (천천히 줄여 cold start 피크 회피) |

### Phase별 정책

- **Phase 1**: 기본 Target Tracking만
- **Phase 2**: Container Insights로 task별 부하 분포까지 모니터링 (정확도↑)

---

## § 7. 서비스 디스커버리 — Cloud Map

**문제**: Fargate Task는 재시작마다 IP 변경
**해결**: Cloud Map이 고정 DNS 이름 제공

### Namespace: medical-ai.local (VPC 내부 Private DNS)

```
orchestrator     → orchestrator.medical-ai.local
ecg-service      → ecg-svc.medical-ai.local
cxr-service      → cxr-svc.medical-ai.local
lab-service      → lab-svc.medical-ai.local
```

### ALB는 내부 통신에 미사용

- Cloud Map DNS가 더 가볍고 빠름
- VPC 외부로 나갔다 들어올 필요 X
- ALB는 외부 진입(`/api/*`)에만 사용

---

## § 8. 트래픽 경로

### 외부 트래픽 — ALB Path Routing

```
의사 브라우저
   │
   ▼
CloudFront → WAF → ALB
                    │
                    ├─ /api/*    → orchestrator-service
                    └─ /healthz  → orchestrator-service
```

### 내부 통신 — Cloud Map DNS

```
orchestrator
   │
   ├─► ecg-svc.medical-ai.local:8000      (병렬)
   ├─► cxr-svc.medical-ai.local:8000      (병렬)
   ├─► lab-svc.medical-ai.local:8000      (병렬)
   ├─► HAPI EC2:8080                       (FHIR API)
   ├─► Aurora:5432                         (운영 DB)
   └─► Bedrock (VPC Endpoint)              (LLM 호출)
```

---

## § 9. 배포 전략

### Rolling Update (Phase 1 기본)

- 기존 Task를 순차 교체 (Min Healthy 50%, Max 200%)
- 다운타임 0
- 롤백 단순 (이전 Task Definition revision으로 복귀)

---

## § 10. 컴퓨팅 비용 (서울 리전, On-Demand)

### Fargate Service별 (Task × 2, 24h × 30일)

| Service | 사양 | Tasks | 월 비용 |
|---|---|---|---|
| orchestrator | 1 vCPU / 2 GB | × 2 | $115 |
| ecg-svc | 2 vCPU / 4 GB | × 2 | $230 |
| cxr-svc | 4 vCPU / 8 GB | × 2 | $461 |
| lab-svc | 1 vCPU / 2 GB | × 2 | $115 |
| **Fargate 합계** | | | **$921/월 (baseline)** |
| | | | ~$1,150/월 (Auto Scaling 평균 +25%) |

### 추가 비용

| 항목 | 월 비용 |
|---|---|
| HAPI EC2 t4g.medium | $25 |
| ALB | $25 |

### 컴퓨팅 영역 Phase 1 합계

- **Baseline**: ~$971/월
- **Auto Scaling 평균 포함**: ~$1,200/월

### 비용 절감 옵션

- **Fargate Savings Plans (1년 약정)** → 20% 절감 → ~$736/월
- **CXR 모델 경량화** → 4 vCPU → 2 vCPU 다운사이즈 가능성 검토
- **Reserved Instance (HAPI EC2 1년)** → 30% 절감 → $17.5/월

---

## § 11. 컴퓨팅 영역 설계 7대 원칙

1. **모달별 독립** — 기술 스택 격리 + 독립 스케일링 + 독립 배포
2. **서버리스 우선** — Fargate로 운영 부담 최소화
3. **Multi-AZ HA** — 각 Service Task 2개 × 2 AZ 분산
4. **DNS 기반 통신** — Cloud Map으로 IP 변동 무관
5. **ASG 회피** — Graceful Degradation이 1차 안전망 (HAPI 1대)
6. **JVM 안정성** — HAPI는 EC2 장기 가동 (JIT 최적화 유지)
7. **점진 도입** — Redis / X-Ray / Container Insights는 Phase 2

---

*문서 끝*
