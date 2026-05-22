# 응급의료 AI 진단보조 시스템 네트워크 영역 설계 문서

**AWS 아키텍처 운영 네트워킹 가이드 v1.0**

---

## § 1. 네트워크 자원 구성 개요

```
인터넷
   │
   ▼
Route 53 (DNS) → CloudFront (CDN/Edge) → ALB (Public Subnet)
                                            │
                                            ▼
                                    Private App Subnet
                                    (ECS Tasks)
                                            │
                            ┌───────────────┼───────────────┐
                            ▼               ▼               ▼
                    Private Data       VPC Endpoints   Cloud Map DNS
                    (Aurora/HAPI)     (AWS 서비스)     (내부 통신)
```

### 핵심 자원 (9종)

| 자원 | 역할 | 위치 |
|---|---|---|
| VPC | 가상 네트워크 (10.0.0.0/16) | 전체 |
| Subnet | 네트워크 분할 (4종, 각 2 AZ) | VPC 내부 |
| Internet Gateway (IGW) | VPC ↔ 인터넷 통로 | VPC 경계 |
| Route Table | 트래픽 라우팅 규칙 | Subnet별 |
| Route 53 | 외부 DNS 서비스 | 글로벌 |
| CloudFront | Edge CDN | 글로벌 (217 PoP) |
| ALB | Application Load Balancer | Public Subnet |
| Cloud Map | 내부 DNS (서비스 디스커버리) | VPC 내부 |
| VPC Endpoints | AWS 서비스 PrivateLink | Endpoints Subnet |

---

## § 2. VPC 전체 구조

### 2.1 VPC CIDR

```
VPC: 10.0.0.0/16
─────────────────────────────────────────────────────────────────────
─ 총 65,536개 IP 사용 가능
─ 리전: ap-northeast-2 (서울)
─ DNS hostname 활성화
─ DNS resolution 활성화
```

### 2.2 Multi-AZ 분산 (2 AZ)

```
ap-northeast-2a    ap-northeast-2c
       │                  │
       └────── VPC ───────┘
       10.0.0.0/16 (전체 영역)
```

응급 의료 시스템 = 가용성 최우선 → **모든 Subnet을 2 AZ에 분산 배치**

---

## § 3. Subnet 4종 구성

```
┌────────────────────────────────────────────────────────────────────┐
│ ① Public Subnet — 인터넷 노출 영역                                  │
│   ─ Public-A   10.0.0.0/24   AZ-a                                  │
│   ─ Public-C   10.0.2.0/24   AZ-c                                  │
│   ─ 들어있는 것: ALB                                                 │
│   ─ Route Table: 0.0.0.0/0 → IGW                                    │
├────────────────────────────────────────────────────────────────────┤
│ ② Private App Subnet — ECS Tasks 영역                               │
│   ─ App-A      10.0.11.0/24  AZ-a                                  │
│   ─ App-C      10.0.12.0/24  AZ-c                                  │
│   ─ 들어있는 것: ECS Tasks (orchestrator + ecg/cxr/lab)              │
│   ─ Route Table: 인터넷 직접 X (VPC Endpoint 경유)                   │
├────────────────────────────────────────────────────────────────────┤
│ ③ Private Data Subnet — DB/스토리지 격리 영역                       │
│   ─ Data-A     10.0.21.0/24  AZ-a                                  │
│   ─ Data-C     10.0.22.0/24  AZ-c                                  │
│   ─ 들어있는 것: Aurora SLv2, HAPI EC2, ChromaDB EC2                 │
│   ─ Route Table: ★ 인터넷 outbound 차단 (NACL-Data)                 │
├────────────────────────────────────────────────────────────────────┤
│ ④ VPC Endpoints Subnet — AWS 서비스 전용 통로                       │
│   ─ Endpoints  10.0.31.0/24  AZ-a (Interface Endpoint ENI 배치)    │
│   ─ 들어있는 것: Bedrock/ECR/Secrets/CW Logs Endpoint ENI            │
└────────────────────────────────────────────────────────────────────┘
```

### Subnet 설계 원칙

1. **3-tier 분리** (Public / Private App / Private Data) — defense-in-depth
2. **Multi-AZ** — 모든 Tier에 AZ-a/AZ-c 2개씩 (HA)
3. **CIDR 여유** — 각 /24 = 256 IP, 모달 확장 여유 충분
4. **Data Tier 인터넷 outbound 차단** — 데이터 유출 방지 최후 보루

---

## § 4. Internet Gateway (IGW)

### 4.1 역할

VPC와 인터넷을 연결하는 **단일 게이트웨이**.

```
인터넷
   │
   ▼
┌────────────────┐
│  IGW           │  ← 필터링 X, 단순 통로
│  (VPC 경계)     │  ← AWS가 자동 관리, 운영 부담 0
└───────┬────────┘
        │
        ▼
   VPC 내부 (10.0.0.0/16)
        │
   Route Table → "0.0.0.0/0 → IGW"
        │
        ▼
   Public Subnet의 ALB
```

### 4.2 특징

- VPC당 IGW 1개만 attach 가능
- 가용성·확장성 모두 AWS 관리 (별도 비용 없음)
- 필터링 기능 없음 → 모든 보안은 **NACL → SG** 두 단계로 처리
- IPv4 NAT 기능 자동 (Public IP를 가진 인스턴스 ↔ 인터넷)

### 4.3 우리 시스템에서의 위치

- Public Subnet에만 IGW로 향하는 라우트
- Private App / Private Data Subnet은 IGW 사용 안 함 → VPC Endpoint 경유

---

## § 5. Route Table (라우팅 규칙)

각 Subnet에는 Route Table 1개가 attach됩니다. **"트래픽을 어디로 보낼지" 결정**.

### 5.1 Public Subnet Route Table

```
Destination          Target          용도
─────────────────────────────────────────────────────────────────
10.0.0.0/16          local           VPC 내부 통신
0.0.0.0/0            igw-xxxxx       인터넷 외부 (ALB → 사용자)
```

### 5.2 Private App Subnet Route Table

```
Destination          Target                          용도
─────────────────────────────────────────────────────────────────
10.0.0.0/16          local                           VPC 내부
pl-xxxx (S3)         vpce-s3-xxxx                    S3 Gateway Endpoint
─                    ─                               ★ 0.0.0.0/0 → IGW 없음
                                                     (인터넷 직접 X)
```

→ Bedrock/ECR/Secrets/CW Logs는 **Interface Endpoint(ENI)** 경유 → Endpoints Subnet으로 라우팅

### 5.3 Private Data Subnet Route Table

```
Destination          Target                          용도
─────────────────────────────────────────────────────────────────
10.0.0.0/16          local                           VPC 내부만
pl-xxxx (S3)         vpce-s3-xxxx                    S3 Gateway (백업용)
─                    ─                               ★ 0.0.0.0/0 없음
                                                     (인터넷 outbound 차단)
```

### 5.4 VPC Endpoints Subnet Route Table

```
Destination          Target          용도
─────────────────────────────────────────────────────────────────
10.0.0.0/16          local           VPC 내부 응답만
─                    ─               외부 라우팅 없음
```

---

## § 6. Route 53 (외부 DNS)

### 6.1 역할

도메인 이름을 IP로 변환하는 AWS 매니지드 DNS 서비스.

### 6.2 설정

```
호스팅 존: eadss.example.com
─────────────────────────────────────────────────────────────────────
레코드 타입       이름                    값
A (Alias)        eadss.example.com  →   CloudFront Distribution
A (Alias)        www.eadss.example  →   CloudFront Distribution
─────────────────────────────────────────────────────────────────────

DNSSEC: 활성화 (DNS 응답 위변조 방지)
TTL: 60초 (장애 시 빠른 전환)

Health Check 2개:
─ ALB /healthz 경로 30초 주기 → Primary
─ S3 정적 에러 페이지         → Failover (DR)

DNS 쿼리 로그 → CloudWatch Logs
  (Phase 2 GuardDuty가 비정상 도메인 조회 패턴 자동 탐지)
```

### 6.3 비용

- 호스팅 존 1개: $0.5/월
- Health Check 2개: ~$1/월
- **합계: ~$1.5/월**

---

## § 7. CloudFront (Edge CDN)

### 7.1 역할

전 세계 217개 PoP에서 콘텐츠를 캐싱·전송하는 CDN 서비스.

### 7.2 캐싱 정책

```
경로                  캐싱        용도
─────────────────────────────────────────────────────────────────────
/static/*            1년         프론트엔드 빌드 결과물 (JS/CSS/이미지)
/api/*               캐싱 X      백엔드 API (실시간 데이터)
/ws                  WebSocket   양방향 통신 (alarm 푸시)
```

### 7.3 보안 설정

- **TLS 1.3 최소 버전 강제** (낡은 TLS 차단)
- **Origin Access Identity (OAI)**: CloudFront만 ALB에 접근 가능, 직접 ALB IP 노출 차단
- **AWS WAF 부착**: CloudFront 레벨에서 SQL injection/XSS/Rate-limit 적용
- **Geo-blocking** (선택): 한국 외 IP 차단

### 7.4 비용

- 데이터 전송 + 요청 수 기준
- **우리 규모 추정: 월 ~$8**

---

## § 8. ALB (Application Load Balancer)

### 8.1 역할

외부 HTTP/HTTPS 트래픽을 **여러 ECS Task에 분배**하는 L7 로드밸런서.

### 8.2 위치

```
Public Subnet 2 AZ에 배치 (HA)
─ AZ-a: 10.0.0.0/24
─ AZ-c: 10.0.2.0/24

→ ALB는 2개 AZ에 ENI를 가지며, 한쪽 AZ 죽어도 다른 AZ가 받음
```

### 8.3 Path-based Routing

```
Listener: HTTPS 443
─────────────────────────────────────────────────────────────────────
경로 매칭                          Target Group
/api/*                  →         orchestrator-tg (ECS orchestrator)
/healthz                →         orchestrator-tg
─────────────────────────────────────────────────────────────────────
※ ecg/cxr/lab은 ALB에 노출 안 함 — 내부 Cloud Map DNS만 사용
```

### 8.4 Health Check

```
Target Group: orchestrator-tg
─────────────────────────────────────────────────────────────────────
프로토콜:           HTTP
경로:              /healthz
포트:              8000
주기:              30초
정상 임계값:        2회 연속 200 OK
비정상 임계값:      3회 연속 실패 → Task 자동 교체
```

### 8.5 추가 기능

- **Sticky Session**: WebSocket 연결 유지용 (필요 시)
- **TLS Termination**: CloudFront→ALB 구간 HTTPS, ALB→ECS 구간 HTTP (VPC 내부)
- **HTTP/1.1 + WebSocket Upgrade** 지원

### 8.6 보안 그룹

```
[alb-sg]
  Inbound:   443/80 ← 0.0.0.0/0 (인터넷 누구나)
  Outbound:  8000   → central-sg (ECS Task에만)
```

### 8.7 비용

- ALB 기본료: $20/월
- LCU(Load Balancer Capacity Unit): ~$5/월
- **합계: ~$25/월**

---

## § 9. Cloud Map (내부 DNS 서비스 디스커버리)

### 9.1 역할

**Fargate Task는 재시작마다 IP 변경** → 고정 DNS 이름으로 서비스 호출 가능하게 함.

### 9.2 Namespace 구성

```
Namespace: medical-ai.local
─────────────────────────────────────────────────────────────────────
타입: VPC 내부 Private DNS (인터넷에서 조회 불가)

서비스 등록:
  orchestrator-service → orchestrator.medical-ai.local
  ecg-service          → ecg-svc.medical-ai.local
  cxr-service          → cxr-svc.medical-ai.local
  lab-service          → lab-svc.medical-ai.local

자동 동작:
  ─ ECS Task가 시작되면 Cloud Map에 자동 등록 (IP 등록)
  ─ Task가 죽으면 자동 제거 (Health Check 연동)
  ─ DNS 조회 시 살아있는 Task IP 중 하나 반환 (라운드로빈)
```

### 9.3 호출 예시

```python
# orchestrator가 ecg-svc 호출
async with httpx.AsyncClient() as client:
    response = await client.post(
        "http://ecg-svc.medical-ai.local:8000/predict",
        json={"subject_id": "15638163"}
    )
```

Task 2개가 떠있으면 → Cloud Map이 자동으로 IP 2개 중 하나로 분배.

### 9.4 ALB와 차이

| | ALB | Cloud Map |
|---|---|---|
| 용도 | 외부 → 내부 | 내부 → 내부 |
| 프로토콜 | HTTPS (L7) | DNS (UDP/TCP 53) |
| 비용 | $25/월 | 거의 무료 |
| 속도 | 1 hop 추가 | 직접 호출 |
| 헬스체크 | 자체 수행 | ECS 헬스체크 연동 |

→ **내부 통신엔 Cloud Map이 더 가볍고 빠름** (ALB는 외부 진입용)

### 9.5 비용

- Namespace: $0.5/월
- 서비스 등록 4개: ~$0.04/월
- DNS 쿼리: 거의 무료 (백만 쿼리당 $0.4)
- **합계: 월 $1 미만**

---

## § 10. VPC Endpoints (AWS 서비스 전용 통로)

### 10.1 왜 VPC Endpoint를 쓰나

```
[NAT Gateway 사용 시 — 사용 안 함]
ECS Task → NAT Gateway($45/월/AZ) → IGW → 인터넷 → Bedrock
  ↓
- NAT Gateway 비용 ($45 × 2 AZ = $90/월)
- 인터넷 노출 (보안 리스크)
- 지연 시간↑

[VPC Endpoint 사용 — ★ 채택]
ECS Task → VPC Endpoint (PrivateLink) → Bedrock 직접
  ↓
- NAT 불필요
- 인터넷 안 거침 (보안↑)
- 지연 시간↓ (Edge 캐싱)
```

### 10.2 우리 시스템 Endpoints 6개

| Endpoint | 타입 | 용도 | 월 비용 |
|---|---|---|---|
| `com.amazonaws.ap-northeast-2.bedrock-runtime` | Interface | LLM 호출 | ~$7 |
| `com.amazonaws.ap-northeast-2.s3` | **Gateway (무료)** | MIMIC 데이터 / 백업 | $0 |
| `com.amazonaws.ap-northeast-2.ecr.api` | Interface | ECR API | ~$7 |
| `com.amazonaws.ap-northeast-2.ecr.dkr` | Interface | Docker 이미지 풀 | ~$7 |
| `com.amazonaws.ap-northeast-2.secretsmanager` | Interface | DB 비밀번호 조회 | ~$7 |
| `com.amazonaws.ap-northeast-2.logs` | Interface | CloudWatch Logs 전송 | ~$7 |

### 10.3 Gateway vs Interface 차이

```
S3 = Gateway Endpoint (무료!)
─ Route Table에 prefix list 추가만 하면 됨
─ ENI 생성 안 함
─ 데이터 전송 비용도 무료

나머지 5개 = Interface Endpoint (ENI 기반)
─ Endpoints Subnet에 ENI 생성 (10.0.31.x)
─ Private DNS 자동 활성화 → 코드 변경 없이 호출 가능
─ 시간당 + 데이터 전송 비용
```

### 10.4 비용 합계

- Interface 5개 × $7 = **$35**
- Gateway 1개 = **$0**
- **합계: 월 ~$35**

### 10.5 Endpoints Subnet 보안

```
[endpoints-sg]
  Inbound:   443 ← central-sg / hapi-sg  (ECS/HAPI에서만 접근)
  Outbound:  (불필요)

[NACL-Endpoints]
  Inbound:   443 from App + Data
  Outbound:  eph to VPC 내부만 (★ 외부 차단)
```

---

## § 11. 트래픽 흐름 — 의사 트리아지 클릭 시

```
[외부 진입 흐름]
─────────────────────────────────────────────────────────────────────
의사 브라우저
   │ HTTPS 443
   ▼
Route 53 (DNS 조회 → CloudFront IP 반환)
   │
   ▼
CloudFront Edge (WAF 검사 + TLS 1.3 종료 + OAI 인증)
   │ HTTPS
   ▼
ALB (Public Subnet, alb-sg)
   │ HTTP 8000 (VPC 내부)
   ▼ Path /api/* → orchestrator-tg
ECS orchestrator Task (Private App, central-sg)
```

```
[내부 통신 흐름]
─────────────────────────────────────────────────────────────────────
ECS orchestrator
   │
   ├─► Cloud Map: ecg-svc.medical-ai.local → ECG Task IP ──► 추론
   │
   ├─► Cloud Map: cxr-svc.medical-ai.local → CXR Task IP ──► 추론
   │
   ├─► Cloud Map: lab-svc.medical-ai.local → LAB Task IP ──► 추론
   │
   ├─► HAPI EC2 (Private Data, hapi-sg) :8080  ────────────► FHIR
   │
   ├─► Aurora SLv2 (Private Data, aurora-sg) :5432 ────────► DB
   │
   └─► VPC Endpoint (Endpoints Subnet, endpoints-sg) :443
       │
       ├─► Bedrock (PrivateLink, IGW 안 거침)
       ├─► S3 (Gateway Endpoint)
       └─► Secrets Manager (Interface Endpoint)
```

```
[응답 경로]
─────────────────────────────────────────────────────────────────────
ECS orchestrator → ALB → CloudFront → 의사 브라우저
                                       (Edge 캐싱 효과)
```

---

## § 12. NAT Gateway — 의도적으로 사용 안 함

```
일반적 패턴 (NAT 사용)              우리 패턴 (VPC Endpoint 사용)
─────────────────────────────       ─────────────────────────────
Private Subnet                      Private Subnet
   ↓                                   ↓
NAT Gateway × 2 AZ                  VPC Endpoints (5 Interface + 1 GW)
($45 × 2 = $90/월)                  ($35/월)
   ↓                                   ↓
IGW                                  AWS 서비스 직접 (PrivateLink)
   ↓
인터넷
   ↓
AWS 서비스 API

비용:  $90/월                        $35/월       (-$55)
보안:  인터넷 경유                    내부망만      (★ 안전)
속도:  여러 hop                      직접 호출    (★ 빠름)
```

→ **NAT Gateway 미사용으로 비용 절감 + 보안 강화 동시 달성**

---

## § 13. 네트워크 비용 합계

| 항목 | 월 비용 |
|---|---|
| VPC / Subnet / IGW / Route Table | $0 (무료) |
| Route 53 (DNS) | ~$1.5 |
| CloudFront (CDN + 데이터 전송) | ~$8 |
| ALB | ~$25 |
| Cloud Map | <$1 |
| VPC Endpoints (Interface 5 + Gateway 1) | ~$35 |
| NAT Gateway | $0 (미사용) |
| **합계** | **~$70/월** |

→ NAT를 안 쓰는 대신 VPC Endpoint를 활용해 보안과 비용을 동시에 잡음.

---

## § 14. 네트워크 영역 설계 7대 원칙

1. **3-tier Subnet 분리** — Public / Private App / Private Data + Endpoints
2. **Multi-AZ 분산** — 모든 Subnet 2 AZ 배치 (HA)
3. **Data Tier 인터넷 차단** — DB Subnet outbound 전면 차단 (데이터 유출 방지)
4. **NAT 미사용, Endpoint 우선** — 비용 절감 + 인터넷 노출 회피
5. **외부 진입은 ALB, 내부 통신은 Cloud Map** — 용도별 분리
6. **Edge 보안 다층** — Route 53 + CloudFront + WAF + ALB-sg
7. **DNS 기반 통신** — IP 의존성 제거 (Task 재시작 무관)

---

## § 15. Phase별 네트워크 확장 계획

### Phase 1 (MVP / 데모)

- VPC + 4 Subnet (2 AZ)
- IGW + Route Table
- ALB + Cloud Map
- VPC Endpoints 6개
- Route 53 + CloudFront + WAF

### Phase 2 (운영 진입 시 추가)

```
+ Bastion Host (Public Subnet)
    → HAPI EC2 SSH 접근용 (Phase 2 운영팀)

+ Transit Gateway 검토
    → 멀티 VPC 환경 전환 시 (개발/스테이징/운영 분리)

+ AWS PrivateLink로 외부 EMR 연동
    → 병원 EMR과 HAPI 간 전용 회선
```

### Phase 3 (다병원 확장)

```
+ Aurora Global Database
    → 서울(Primary) + 도쿄(Replica) DR 구성

+ Route 53 Latency-based Routing
    → 지역별 가까운 리전으로 자동 라우팅

+ CloudFront Origin Failover
    → ALB 장애 시 백업 Origin 자동 전환
```

---

*문서 끝*
