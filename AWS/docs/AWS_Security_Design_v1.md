# 응급의료 AI 진단보조 시스템 보안 설계 문서

**AWS 아키텍처 운영 보안 가이드 v1.0**

---

## § 1. 외부 진입 보안 (Edge Security)

```
   인터넷 사용자
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ ① Route 53 (DNS)                                                 │
│   ─ eadss.example.com → CloudFront Alias                        │
│   ─ DNSSEC 활성화                                                │
│   ─ Health Check 2개: ALB /healthz + S3 정적 에러 페이지         │
│   ─ DNS 쿼리 로그 → CloudWatch Logs (Phase 2 GuardDuty 입력)    │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ ② CloudFront (Edge CDN)                                          │
│   ─ TLS 1.3 최소 버전 강제                                        │
│   ─ Origin Access Identity로 ALB 직접 노출 차단                  │
│   ─ /static/*: 1년 캐싱 / /api/*: bypass / /ws: WebSocket 지원   │
└─────────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────────┐
│ ③ AWS WAF 1개 (CloudFront에 부착)                                │
│   활성화 룰셋:                                                    │
│   ─ AWS Managed Rules — Common Rule Set (OWASP Top 10)          │
│   ─ AWS Managed Rules — Known Bad Inputs                        │
│   ─ AWS Managed Rules — SQL Database                            │
│   ─ Rate-based Rule: IP당 1000 req/5분                          │
│   ─ Geo-blocking (선택): 한국 외 차단                            │
│   모드: 1주 Count Mode → 오탐 검증 후 Block 전환                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## § 2. 네트워크 보안 — 3-tier VPC + NACL 4개 + SG 5개

### 2.1 VPC Subnet 구성

```
VPC 10.0.0.0/16 — 4 Subnet 분리

   ┌────────────────────────────────────────────────────────────┐
   │ Public Subnet      10.0.0.0/24 (AZ-a)  / 10.0.2.0/24 (AZ-c)│
   │   └─ ALB                                                    │
   ├────────────────────────────────────────────────────────────┤
   │ Private App        10.0.11.0/24 (AZ-a) / 10.0.12.0/24 (c)  │
   │   └─ ECS Tasks (orchestrator + ecg/cxr/lab)                 │
   ├────────────────────────────────────────────────────────────┤
   │ Private Data       10.0.21.0/24 (AZ-a) / 10.0.22.0/24 (c)  │
   │   └─ Aurora SLv2 + HAPI EC2 + Chroma DB EC2                 │
   ├────────────────────────────────────────────────────────────┤
   │ VPC Endpoints      10.0.31.0/24                             │
   │   └─ Bedrock / S3(GW) / ECR / Secrets Mgr / CW Logs         │
   └────────────────────────────────────────────────────────────┘
```

### 2.2 NACL 4개 (Subnet 경계 · Stateless · Deny 가능)

```
[NACL-Public]
  Inbound:   443/80/eph from 0.0.0.0/0
  Outbound:  8000 to App Subnet, eph to 0.0.0.0/0

[NACL-App]
  Inbound:   8000 from Public + self, eph
  Outbound:  8080/5432 to Data, 443 to Endpoints, eph

[NACL-Data]
  Inbound:   5432/8080 from App, 5432 from self
  Outbound:  443 to Endpoints, eph to App
             ★ 인터넷 outbound 전면 차단 (데이터 유출 방지)

[NACL-Endpoints]
  Inbound:   443 from App + Data
  Outbound:  eph to VPC 내부만
```

### 2.3 Security Group 5개 (인스턴스 경계 · Stateful · Allow only)

```
[alb-sg]            ALB
  Inbound:   443/80  ← 0.0.0.0/0
  Outbound:  8000    → central-sg

[central-sg]        ECS Task 4개 공유 (orchestrator + ecg + cxr + lab)
  Inbound:   8000    ← alb-sg
             8000    ← central-sg  (self-ref, 모달 호출)
  Outbound:  8080    → hapi-sg
             5432    → aurora-sg
             443     → endpoints-sg

[hapi-sg]           HAPI FHIR EC2
  Inbound:   8080    ← central-sg
             22      ← bastion-sg (Phase 2)
  Outbound:  5432    → aurora-sg
             443     → endpoints-sg

[aurora-sg]         Aurora Serverless v2
  Inbound:   5432    ← central-sg + hapi-sg
  Outbound:  (없음)

[endpoints-sg]      VPC Interface Endpoints
  Inbound:   443     ← central-sg + hapi-sg
```

---

## § 3. 데이터 보호 — 암호화 + 비밀 관리

### 3.1 KMS (Customer Managed Key)

- Aurora 저장 데이터 암호화
- S3 버킷 SSE-KMS
- Secrets Manager 비밀 암호화
- EBS 볼륨 (HAPI EC2, Chroma DB EC2) 암호화

### 3.2 Secrets Manager (Day 1 필수)

| 저장 secret | 위치 | Rotation |
|---|---|---|
| aurora-master | Secrets Manager | 30일 자동 |
| aurora-app-user | Secrets Manager | 30일 자동 |
| hapi-db-user | Secrets Manager | 30일 자동 |
| Slack Webhook URL | Parameter Store | 수동 (rotation 불필요) |
| Bedrock | IAM Role 사용 | secret 없음 |

### 3.3 ECS Task Definition 직접 주입

```json
{
  "secrets": [{
    "name": "DB_PASSWORD",
    "valueFrom": "arn:aws:secretsmanager:...:secret:aurora-app"
  }]
}
```

→ 환경변수 자동 주입, 코드 내 password 흔적 0

**비용**: $0.40 × 3 secret + KMS = 월 ~$3

---

## § 4. 인증 / 인가 (AuthN / AuthZ)

### 4.1 사용자 인증 — Cognito

- User Pool: 의사/간호사 계정 관리
- MFA 필수 (TOTP)
- JWT 발급 → ALB 또는 ECS에서 검증
- Identity Pool: AWS 리소스 임시 자격 증명

### 4.2 서비스 간 IAM Role (최소권한 원칙)

- **ECS Task Execution Role**
  - Secrets Manager, ECR, CloudWatch Logs
- **ECS Task Role**
  - Bedrock InvokeModel, S3 GetObject
- **HAPI EC2 Instance Profile**
  - Secrets Manager, CloudWatch Logs

---

## § 5. 감사 추적 (Audit Trail)

### 5.1 CloudTrail (Day 1 무조건 활성화)

- Management Events: 무료, 배포 전 ON
- S3 Data Events: MIMIC 버킷만 (~$2/월)
- Multi-region Trail
- S3 저장 (KMS 암호화) → 30일 후 Glacier 이관
- ★ 의료법 5년 보존

### 5.2 CloudWatch Logs (awslogs 드라이버)

- Log Group 6개:
  - `/ecs/orchestrator`
  - `/ecs/ecg-svc`
  - `/ecs/cxr-svc`
  - `/ecs/lab-svc`
  - `/ecs/prognosis-svc`
  - `/hapi-fhir`
- Retention: ECS 30일 / HAPI 90일 → S3 export → Glacier
- ★ PHI(이름·수치·영상·진단 본문) 절대 로깅 금지 — ID/카운트/시간 메타데이터만 기록

### 5.3 진료 기록 source of truth

- 운영 DB: `modal_results`, `service_requests`, `diagnostic_reports`
- FHIR HAPI: `ServiceRequest`, `Observation`, `DiagnosticReport`
- 의료법 5년 보존

---

## § 6. 가용성 보안 — Graceful Degradation

### 6.1 HAPI FHIR 장애 시 임상 무중단

- 운영 DB + `fhir_sync_queue` 자동 적재
- 5분 주기 Retry Worker가 자동 백필
- TEST 1/2/3 검증 완료

### 6.2 설계 배경

- HAPI는 EC2 t4g.medium 단일 인스턴스 (ASG 미사용)
- 이유: Graceful Queue가 1차 안전망 → 운영 복잡도 회피

---

## § 7. 위협 탐지 (Phase 2)

### 7.1 GuardDuty (Phase 2 운영 진입 시)

- VPC Flow Logs + CloudTrail + DNS Logs 자동 분석
- 탐지 결과 → EventBridge → SNS → Slack #응급
- **비용**: 월 ~$7

### 7.2 탐지 대상

- 침해된 EC2의 C&C 통신
- 비정상 시간대 IAM 권한 요청 폭증
- 비정상 지리적 위치 콘솔 로그인
- DB → 외부 대용량 전송 (데이터 유출)

---

## § 8. Phase별 보안 비용 합계

| 항목 | Phase 1 (MVP) | Phase 2 (운영 추가) |
|---|---|---|
| WAF (CloudFront 부착) | ~$10 | — |
| CloudTrail (Mgmt 무료 + Data + Glacier) | ~$5.5 | — |
| Secrets Manager + KMS | ~$3 | — |
| Cognito (MAU 5만 무료 티어) | $0 | — |
| VPC Endpoints (Interface 5 + Gateway 1) | ~$35 | — |
| NACL / SG / IAM | $0 | — |
| GuardDuty | — | +$7 |
| ElastiCache Redis | — | +$20 |
| X-Ray + Container Insights | — | +$9 |
| Bastion + SSH 관리 | — | +$5 |
| **합계** | **~$53/월** | **+$41/월** |

→ **운영 단계 총합: 월 ~$94**

---

## § 9. 보안 설계 7대 원칙

1. **Defense-in-Depth** — NACL + SG 이중 방어
2. **Least Privilege** — IAM/SG/DB user 모두 최소권한
3. **Encrypt Everywhere** — 저장(KMS) + 전송(TLS 1.3)
4. **Secrets Never in Code** — Secrets Manager + Rotation 강제
5. **Audit Everything** — CloudTrail Day 1 + 의료법 5년 보존
6. **Fail Gracefully** — HAPI 다운 시 임상 플로우 무중단
7. **Zero PHI in Logs** — 로그는 ID/메타데이터만

---

*문서 끝*
