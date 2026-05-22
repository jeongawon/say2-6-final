# say2-6team 보안 설정 현황 - 전체 정리

> **작성일**: 2026-05-19  
> **작성자**: 컴퓨팅팀 (이정인)  
> **목적**: 현재 구현된 보안 설정을 한눈에 파악

---

## 📊 보안 설정 요약 (한눈에 보기)

| 보안 영역 | 상태 | 설명 |
|----------|------|------|
| **네트워크 격리** | ✅ 구현됨 | VPC, Private Subnet, Security Group |
| **암호화 (저장)** | ✅ 구현됨 | KMS, Aurora 암호화, S3 암호화 |
| **암호화 (전송)** | ⚠️ 부분 구현 | VPC 내부 HTTPS, ALB는 HTTP만 |
| **접근 제어** | ✅ 구현됨 | IAM Role, Security Group |
| **비밀 관리** | ✅ 구현됨 | Secrets Manager, KMS |
| **WAF** | ✅ 구현됨 (Count 모드) | Rate Limiting, SQL Injection, XSS |
| **로깅/감사** | ✅ 구현됨 | CloudWatch Logs, VPC Flow Logs |
| **HTTPS (ALB)** | ❌ 미구현 | HTTP만 허용 (개발 단계) |
| **ACM 인증서** | ❌ 미구현 | 프로덕션 전환 시 필요 |
| **도메인** | ❌ 미구현 | Route 53 미설정 |

---

## 1️⃣ 네트워크 보안

### ✅ VPC 격리
```
VPC: 10.0.0.0/16 (say2-6team-vpc)
├─ Public Subnet (ALB용)
│  ├─ 10.0.0.0/24 (AZ-a)
│  └─ 10.0.1.0/24 (AZ-c)
│
├─ Private App Subnet (ECS용)
│  ├─ 10.0.10.0/24 (AZ-a)
│  └─ 10.0.11.0/24 (AZ-c)
│  └─ ❌ NAT Gateway 없음 (인터넷 직접 접근 불가)
│
├─ Private Data Subnet (Aurora용)
│  ├─ 10.0.20.0/24 (AZ-a)
│  └─ 10.0.21.0/24 (AZ-c)
│  └─ ❌ NAT Gateway 없음 (인터넷 직접 접근 불가)
│
└─ Endpoint Subnet (VPC Endpoint용)
   ├─ 10.0.30.0/24 (AZ-a)
   └─ 10.0.31.0/24 (AZ-c)
```

**보안 효과:**
- ✅ ECS 컨테이너는 Private Subnet에서 실행 (인터넷 직접 노출 안 됨)
- ✅ Aurora DB는 Data Subnet에서 실행 (외부 접근 불가)
- ✅ ALB만 Public Subnet에 배치 (외부 접근 가능)

### ✅ Security Groups (방화벽)

#### ALB Security Group (`say2-6team-alb-sg`)
```
Inbound:
  ✅ Port 443 (HTTPS) ← 0.0.0.0/0 (인터넷 전체)
  ❌ Port 80 (HTTP) ← 없음! (문제!)

Outbound:
  ✅ Port 8000 → Orchestrator (central-sg)
```

**문제점:** HTTP Port 80이 없어서 프론트엔드 연동 불가!

#### Orchestrator Security Group (`say2-6team-central-sg`)
```
Inbound:
  ✅ Port 8000 ← ALB (alb-sg)

Outbound:
  ✅ Port 8001 → ECG Service (ecg-sg)
  ✅ Port 8002 → CXR Service (cxr-sg)
  ✅ Port 8003 → Lab Service (lab-sg)
  ✅ Port 5432 → Aurora (aurora-sg)
  ✅ Port 443 → VPC Endpoints (endpoints-sg)
  ✅ Port 443 → 0.0.0.0/0 (S3 Gateway Endpoint용)
```

#### Modal Service Security Groups
```
ECG Service (ecg-sg):
  Inbound: Port 8001 ← Orchestrator (central-sg)
  Outbound: Port 443 → VPC Endpoints, S3

CXR Service (cxr-sg):
  Inbound: Port 8002 ← Orchestrator (central-sg)
  Outbound: Port 443 → VPC Endpoints, S3

Lab Service (lab-sg):
  Inbound: Port 8003 ← Orchestrator (central-sg)
  Outbound: Port 443 → VPC Endpoints, S3
```

#### Aurora Security Group (`say2-6team-aurora-sg`)
```
Inbound:
  ✅ Port 5432 ← Orchestrator (central-sg)
  ✅ Port 5432 ← HAPI FHIR (hapi-sg)

Outbound:
  ❌ 없음 (DB는 outbound 불필요)
```

### ✅ VPC Endpoints (Private 연결)
```
Gateway Endpoint:
  ✅ S3 Gateway Endpoint
     └─ App/Data Subnet에서 S3 접근 (인터넷 경유 안 함)

Interface Endpoints:
  ✅ Bedrock Runtime (bedrock-runtime)
  ✅ Secrets Manager (secretsmanager)
  ✅ KMS (kms)
  ✅ CloudWatch Logs (logs)
  ✅ ECR API (ecr.api)
  ✅ ECR Docker (ecr.dkr)
```

**보안 효과:**
- ✅ ECS 컨테이너가 AWS 서비스 접근 시 인터넷 경유 안 함
- ✅ Bedrock, Secrets Manager, KMS 모두 Private 연결
- ✅ 데이터 유출 위험 감소

### ✅ VPC Flow Logs
```
대상: VPC 전체 트래픽
저장: S3 (say2-6team-vpc-flow-logs-...)
보관 기간: 90일
```

**보안 효과:**
- ✅ 모든 네트워크 트래픽 기록
- ✅ 보안 사고 발생 시 추적 가능
- ✅ 비정상 트래픽 탐지 가능

---

## 2️⃣ 암호화

### ✅ KMS (Key Management Service)
```
KMS Key: say2-6team-kms-key
Alias: alias/say2-6team-kms-key
Key Rotation: ✅ 활성화 (자동 1년마다)
```

**사용처:**
- Aurora DB 암호화
- Secrets Manager 암호화
- S3 암호화 (필요 시)
- EBS 암호화 (필요 시)

### ✅ Aurora 암호화
```
Storage Encryption: ✅ 활성화 (KMS)
Backup Encryption: ✅ 활성화 (KMS)
Snapshot Encryption: ✅ 활성화 (KMS)
```

**보안 효과:**
- ✅ 저장된 데이터 암호화
- ✅ 백업 데이터 암호화
- ✅ 스냅샷 데이터 암호화

### ✅ Secrets Manager
```
DB 비밀번호: say2-6team-aurora-secret
암호화: ✅ KMS (say2-6team-kms-key)
자동 로테이션: ⚠️ 미설정 (수동 관리)
```

**보안 효과:**
- ✅ DB 비밀번호를 코드에 하드코딩 안 함
- ✅ KMS로 암호화되어 저장
- ✅ IAM Role로 접근 제어

### ⚠️ 전송 중 암호화
```
VPC 내부:
  ✅ Bedrock: HTTPS (VPC Endpoint)
  ✅ Secrets Manager: HTTPS (VPC Endpoint)
  ✅ KMS: HTTPS (VPC Endpoint)
  ✅ S3: HTTPS (Gateway Endpoint)
  ⚠️ ECS ↔ Aurora: PostgreSQL (암호화 미설정)
  ⚠️ Orchestrator ↔ Modal Services: HTTP (Service Discovery)

ALB:
  ❌ HTTP만 허용 (HTTPS 미설정)
  ❌ ACM 인증서 없음
```

**개선 필요:**
- ⚠️ Aurora SSL/TLS 연결 설정 (프로덕션 전환 시)
- ⚠️ ALB HTTPS Listener 추가 (프로덕션 전환 시)

---

## 3️⃣ 접근 제어 (IAM)

### ✅ ECS Execution Role
```
Role: say2-6team-ecs-execution-role
용도: ECS Task 시작 시 필요한 권한

권한:
  ✅ ECR 이미지 Pull
  ✅ CloudWatch Logs 쓰기
  ✅ Secrets Manager 읽기 (Task Definition 환경 변수용)
  ✅ KMS 복호화
```

### ✅ Orchestrator Task Role
```
Role: say2-6team-orchestrator-task-role
용도: Orchestrator 컨테이너 실행 중 권한

권한:
  ✅ Bedrock InvokeModel (AI 종합 소견 생성)
  ✅ Secrets Manager GetSecretValue (DB 비밀번호)
  ✅ KMS Decrypt/Encrypt
  ✅ S3 GetObject/PutObject (say2-6team-* 버킷만)
```

**보안 효과:**
- ✅ 최소 권한 원칙 (Least Privilege)
- ✅ Bedrock 접근은 Orchestrator만 가능
- ✅ S3 접근은 프로젝트 버킷만 가능

### ✅ Modal Service Task Roles
```
ECG Task Role (say2-6team-ecg-task-role):
  ✅ Secrets Manager GetSecretValue
  ✅ KMS Decrypt
  ✅ S3 GetObject/PutObject (모델 파일, 결과 저장)
  ❌ Bedrock 접근 불가 (Orchestrator만 가능)

CXR Task Role (say2-6team-cxr-task-role):
  ✅ Secrets Manager GetSecretValue
  ✅ KMS Decrypt
  ✅ S3 GetObject/PutObject
  ❌ Bedrock 접근 불가

Lab Task Role (say2-6team-lab-task-role):
  ✅ Secrets Manager GetSecretValue
  ✅ KMS Decrypt
  ✅ S3 GetObject/PutObject
  ❌ Bedrock 접근 불가
```

**보안 효과:**
- ✅ Modal Service는 Bedrock 직접 접근 불가
- ✅ Orchestrator만 최종 AI 종합 소견 생성 가능
- ✅ 역할 분리 (Separation of Duties)

---

## 4️⃣ WAF (Web Application Firewall)

### ✅ WAF WebACL
```
WebACL: say2-6team-alb-waf
연결: ALB (say2-6team-alb)
모드: ⚠️ Count (관찰만, 차단 안 함)
```

### ✅ WAF 규칙

#### 1. Rate Limiting
```
규칙: RateLimitRule
제한: 2000 requests / 5분 / IP
동작: ⚠️ Count (차단 안 함)
```

**목적:** DDoS 공격 방어

#### 2. SQL Injection 방어
```
규칙: AWSManagedRulesSQLiRuleSet
동작: ⚠️ Count (차단 안 함)
```

**목적:** SQL Injection 공격 탐지

#### 3. XSS (Cross-Site Scripting) 방어
```
규칙: AWSManagedRulesKnownBadInputsRuleSet
동작: ⚠️ Count (차단 안 함)
```

**목적:** XSS 공격 탐지

### ⚠️ 현재 상태
- ✅ WAF 규칙은 모두 구현됨
- ⚠️ Count 모드 (관찰만, 차단 안 함)
- ⚠️ 프로덕션 전환 시 Block 모드로 변경 필요

**왜 Count 모드인가?**
- 개발 단계에서 정상 트래픽이 차단되는 것 방지
- 오탐(False Positive) 확인 후 Block 모드 전환

---

## 5️⃣ 로깅 및 감사

### ✅ CloudWatch Logs
```
Orchestrator: /drai/central-backend (90일 보관)
CXR Service: /drai/modal/cxr (30일 보관)
ECG Service: /drai/modal/ecg (30일 보관)
Lab Service: /drai/modal/lab (30일 보관)
```

**보안 효과:**
- ✅ 모든 API 요청/응답 기록
- ✅ 에러 추적 가능
- ✅ 보안 사고 발생 시 로그 분석 가능

### ✅ VPC Flow Logs
```
저장: S3 (say2-6team-vpc-flow-logs-...)
보관 기간: 90일
암호화: ✅ S3 SSE-AES256
```

**보안 효과:**
- ✅ 모든 네트워크 트래픽 기록
- ✅ 비정상 접근 탐지 가능
- ✅ 보안 감사 지원

### ⚠️ 미구현 로깅
- ❌ ALB Access Logs (S3 저장)
- ❌ WAF Logs (S3 또는 CloudWatch)
- ❌ CloudTrail (API 호출 기록)

**프로덕션 전환 시 추가 필요**

---

## 6️⃣ 인증 및 권한 부여

### ⚠️ Cognito (미사용)
```
User Pool: say2-6team-user-pool
상태: ✅ 생성됨, ⚠️ 미사용
```

**현재 상태:**
- 프론트엔드가 Cognito 인증 미구현
- 데모 모드로 작동 중 (역할 토글)

**프로덕션 전환 시:**
- Cognito 인증 활성화
- JWT 토큰 검증
- 역할 기반 접근 제어 (RBAC)

---

## 7️⃣ 보안 설정 비교표

### 현재 (개발 단계) vs 프로덕션

| 항목 | 현재 (개발) | 프로덕션 |
|------|------------|---------|
| **ALB 프로토콜** | ❌ HTTP만 | ✅ HTTPS (+ HTTP→HTTPS 리다이렉트) |
| **ACM 인증서** | ❌ 없음 | ✅ 필요 |
| **도메인** | ❌ ALB DNS | ✅ Route 53 (예: api.say2-6team.com) |
| **WAF 모드** | ⚠️ Count | ✅ Block |
| **Cognito 인증** | ❌ 미사용 | ✅ 활성화 |
| **Aurora SSL** | ⚠️ 미설정 | ✅ 필수 |
| **ALB Access Logs** | ❌ 없음 | ✅ S3 저장 |
| **WAF Logs** | ❌ 없음 | ✅ S3 또는 CloudWatch |
| **CloudTrail** | ❌ 없음 | ✅ 활성화 |
| **Security Group** | ⚠️ 0.0.0.0/0 허용 | ✅ 특정 IP/CIDR로 제한 |

---

## 8️⃣ 보안 위험 평가

### 🔴 높음 (즉시 해결 필요)
1. **ALB HTTP Port 80 차단**
   - 문제: 프론트엔드 연동 불가
   - 해결: Security Group에 Port 80 규칙 추가
   - 담당: 보안팀 (양정인)
   - 소요 시간: 5분

### 🟡 중간 (프로덕션 전환 시 해결)
1. **HTTPS 미설정**
   - 문제: 전송 중 데이터 암호화 안 됨
   - 해결: ACM 인증서 + HTTPS Listener
   - 담당: 보안팀 + 컴퓨팅팀
   - 소요 시간: 1주일

2. **WAF Count 모드**
   - 문제: 공격 탐지만 하고 차단 안 함
   - 해결: Block 모드로 전환
   - 담당: 보안팀
   - 소요 시간: 1시간

3. **Cognito 미사용**
   - 문제: 인증/권한 부여 없음
   - 해결: Cognito 인증 활성화
   - 담당: 프론트팀 + 백엔드팀
   - 소요 시간: 1주일

### 🟢 낮음 (장기 개선)
1. **Aurora SSL 미설정**
   - 문제: DB 연결 암호화 안 됨
   - 해결: PostgreSQL SSL 연결 설정
   - 담당: 백엔드팀
   - 소요 시간: 1일

2. **로깅 미흡**
   - 문제: ALB Access Logs, WAF Logs, CloudTrail 없음
   - 해결: 추가 로깅 활성화
   - 담당: 컴퓨팅팀 + 보안팀
   - 소요 시간: 1일

---

## 9️⃣ 보안 체크리스트

### 개발 단계 (현재)
- [x] VPC Private Subnet 구성
- [x] Security Group 설정
- [x] KMS 암호화
- [x] Secrets Manager
- [x] IAM Role (최소 권한)
- [x] VPC Endpoints
- [x] VPC Flow Logs
- [x] CloudWatch Logs
- [x] WAF 규칙 (Count 모드)
- [ ] ALB HTTP Port 80 허용 ← **지금 필요!**

### 프로덕션 전환 시
- [ ] ACM 인증서 발급
- [ ] Route 53 도메인 등록
- [ ] ALB HTTPS Listener 추가
- [ ] HTTP → HTTPS 리다이렉트
- [ ] WAF Block 모드 전환
- [ ] Cognito 인증 활성화
- [ ] Aurora SSL 연결
- [ ] ALB Access Logs 활성화
- [ ] WAF Logs 활성화
- [ ] CloudTrail 활성화
- [ ] Security Group 강화 (특정 IP로 제한)

---

## 🔟 보안 담당자 및 역할

| 담당자 | 역할 | 현재 작업 |
|--------|------|----------|
| **양정인 (yji)** | 네트워크, 보안 | HTTP Port 80 허용 대기 |
| **이정인 (lji)** | 컴퓨팅, 인프라 | ECS 배포 완료, 프론트 연동 대기 |
| **프론트팀** | 프론트엔드 | Cognito 인증 미구현 (개발 중) |
| **백엔드팀** | 백엔드 API | Aurora SSL 미설정 |

---

## 📊 보안 점수 (자체 평가)

| 영역 | 점수 | 평가 |
|------|------|------|
| **네트워크 격리** | 9/10 | ✅ 우수 (Private Subnet, Security Group) |
| **암호화 (저장)** | 9/10 | ✅ 우수 (KMS, Aurora, Secrets Manager) |
| **암호화 (전송)** | 5/10 | ⚠️ 보통 (VPC 내부 HTTPS, ALB HTTP만) |
| **접근 제어** | 8/10 | ✅ 양호 (IAM Role, Security Group) |
| **WAF** | 6/10 | ⚠️ 보통 (규칙 있지만 Count 모드) |
| **로깅/감사** | 7/10 | ✅ 양호 (CloudWatch, VPC Flow Logs) |
| **인증/권한** | 3/10 | ⚠️ 미흡 (Cognito 미사용) |

**전체 평균: 6.7/10 (개발 단계로는 양호, 프로덕션은 개선 필요)**

---

## 💡 핵심 요약

### 잘 구현된 것 ✅
1. **네트워크 격리**: Private Subnet, Security Group, VPC Endpoints
2. **암호화 (저장)**: KMS, Aurora 암호화, Secrets Manager
3. **접근 제어**: IAM Role (최소 권한), Security Group
4. **로깅**: CloudWatch Logs, VPC Flow Logs
5. **WAF**: Rate Limiting, SQL Injection, XSS 규칙

### 개선 필요한 것 ⚠️
1. **ALB HTTP Port 80**: 지금 당장 필요! (프론트 연동 차단 중)
2. **HTTPS**: 프로덕션 전환 시 필수
3. **WAF Block 모드**: 프로덕션 전환 시 필수
4. **Cognito 인증**: 프로덕션 전환 시 필수
5. **Aurora SSL**: 프로덕션 전환 시 권장

### 지금 해야 할 일
1. **보안팀 (양정인)**: ALB Security Group에 HTTP Port 80 규칙 추가 (5분)
2. **컴퓨팅팀 (이정인)**: Security Group 수정 후 프론트 연동 테스트

### 나중에 할 일 (프로덕션 전환 시)
1. ACM 인증서 발급 (보안팀)
2. HTTPS Listener 추가 (컴퓨팅팀)
3. WAF Block 모드 전환 (보안팀)
4. Cognito 인증 활성화 (프론트팀 + 백엔드팀)

---

**작성일:** 2026-05-19  
**작성자:** 컴퓨팅팀 (이정인)  
**버전:** 1.0  
**다음 리뷰:** 프로덕션 전환 전

