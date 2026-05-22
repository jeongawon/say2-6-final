# say2-6 프론트엔드 ECS 연동 가이드

## 📋 목차
1. [개요](#개요)
2. [현재 상태 확인](#현재-상태-확인)
3. [프론트엔드 설정 확인](#프론트엔드-설정-확인)
4. [백엔드 연결 테스트](#백엔드-연결-테스트)
5. [프론트엔드 실행](#프론트엔드-실행)
6. [시연용 데모 케이스 테스트](#시연용-데모-케이스-테스트)
7. [문제 해결](#문제-해결)

---

## 개요

이 문서는 `say2-6-final/frontend` (v1)를 ECS에 배포된 백엔드와 연동하는 방법을 설명합니다.

### 시스템 구성
```
┌─────────────────┐
│   Frontend v1   │ (localhost:3000)
│  (React + Vite) │
└────────┬────────┘
         │ HTTP Proxy
         ↓
┌─────────────────────────────────────────────────┐
│              ALB (Port 80)                      │
│  say2-6team-alb-698170641.ap-northeast-2...    │
└────┬────────────┬────────────┬─────────────┬───┘
     │            │            │             │
     ↓            ↓            ↓             ↓
┌─────────┐  ┌────────┐  ┌────────┐  ┌────────┐
│Orchestr.│  │CXR Svc │  │ECG Svc │  │Lab Svc │
│(8000)   │  │(8002)  │  │(8001)  │  │(8003)  │
└─────────┘  └────────┘  └────────┘  └────────┘
```

### 주요 특징
- **Orchestrator**: 중앙 백엔드, 환자 등록/트리아지/리포트 생성
- **Modal Services**: CXR/ECG/Lab 분석 서비스 (Orchestrator가 호출)
- **ALB 라우팅**: 경로 기반 라우팅으로 각 서비스 분산

---

## 현재 상태 확인

### 1. ECS 서비스 상태 확인

```bash
# 모든 서비스 상태 확인
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services \
    say2-6team-orchestrator-service \
    say2-6team-cxr-svc-service \
    say2-6team-ecg-svc-service \
    say2-6team-lab-svc-service \
  --region ap-northeast-2 \
  --query 'services[].[serviceName,status,runningCount,desiredCount]' \
  --output table
```

**기대 결과:**
```
---------------------------------------------------------
|                   DescribeServices                    |
+--------------------------------------+--------+---+---+
|  say2-6team-orchestrator-service    | ACTIVE | 2 | 2 |
|  say2-6team-cxr-svc-service         | ACTIVE | 2 | 2 |
|  say2-6team-ecg-svc-service         | ACTIVE | 2 | 2 |
|  say2-6team-lab-svc-service         | ACTIVE | 2 | 2 |
+--------------------------------------+--------+---+---+
```

### 2. ALB Target Health 확인

```bash
# ALB ARN 조회
ALB_ARN=$(aws elbv2 describe-load-balancers \
  --names say2-6team-alb \
  --region ap-northeast-2 \
  --query 'LoadBalancers[0].LoadBalancerArn' \
  --output text)

# Target Group ARN 조회
aws elbv2 describe-target-groups \
  --load-balancer-arn $ALB_ARN \
  --region ap-northeast-2 \
  --query 'TargetGroups[].[TargetGroupName,TargetGroupArn]' \
  --output table

# 각 Target Group의 Health 확인 (예: Orchestrator)
TG_ARN=$(aws elbv2 describe-target-groups \
  --names say2-6team-orchestrator-tg \
  --region ap-northeast-2 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

aws elbv2 describe-target-health \
  --target-group-arn $TG_ARN \
  --region ap-northeast-2 \
  --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' \
  --output table
```

**기대 결과:** 모든 타겟이 `healthy` 상태

---

## 프론트엔드 설정 확인

### 1. 디렉토리 이동

```bash
cd say2-6-final/frontend
```

### 2. 환경 변수 확인

**파일:** `.env.local`

```bash
cat .env.local
```

**내용:**
```env
VITE_BACKEND_URL=http://say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com
```

### 3. Vite 프록시 설정 확인

**파일:** `vite.config.ts`

```typescript
const BACKEND_URL = process.env.VITE_BACKEND_URL || "http://say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com";

export default defineConfig({
  server: {
    port: 3000,
    proxy: {
      // Orchestrator 엔드포인트
      "/triage/submit": {
        target: BACKEND_URL,
        changeOrigin: true,
        rewrite: (path) => `/orchestrator${path}`,
      },
      "/encounters": {
        target: BACKEND_URL,
        changeOrigin: true,
        rewrite: (path) => `/orchestrator${path}`,
      },
      "/orders": {
        target: BACKEND_URL,
        changeOrigin: true,
        rewrite: (path) => `/orchestrator${path}`,
      },
      "/reports": {
        target: BACKEND_URL,
        changeOrigin: true,
        rewrite: (path) => `/orchestrator${path}`,
      },
      // Modal Services (직접 접근)
      "/cxr": { target: BACKEND_URL, changeOrigin: true },
      "/ecg": { target: BACKEND_URL, changeOrigin: true },
      "/lab": { target: BACKEND_URL, changeOrigin: true },
    },
  },
});
```

### 4. API 호출 구조 확인

**파일:** `src/lib/v2/api.ts`

주요 API 엔드포인트:
- `POST /triage/submit` → `POST /orchestrator/triage/submit` (ALB)
- `GET /encounters/{eid}/modal-results` → `GET /orchestrator/encounters/{eid}/modal-results`
- `POST /reports/{eid}/generate` → `POST /orchestrator/reports/{eid}/generate`
- `GET /reports/by-encounter/{eid}` → `GET /orchestrator/reports/by-encounter/{eid}`

---

## 백엔드 연결 테스트

### ⚠️ 중요: Security Group 이슈

**현재 상태:**
- ALB Security Group (`sg-0d702017416dadb66`)에 **HTTP Port 80 규칙이 없음**
- HTTPS Port 443만 허용되어 있음
- **결과:** 프론트엔드에서 백엔드 연결 실패

**해결 방법:**
1. `docs/보안팀_Security_Group_수정_요청.md` 문서를 보안팀(양정인)에게 전달
2. HTTP Port 80 인바운드 규칙 추가 요청
3. 규칙 추가 후 아래 테스트 진행

### 1. Health Check 테스트

```bash
# ALB DNS 이름
ALB_DNS="say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com"

# Orchestrator Health Check
curl -v http://${ALB_DNS}/orchestrator/health

# 기대 응답: {"status":"healthy"}
```

**현재 예상 결과:**
```
* Connection timed out
* Failed to connect to say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com port 80
```

### 2. Security Group 수정 후 테스트

보안팀이 Security Group을 수정한 후:

```bash
# 1. Orchestrator Health
curl http://${ALB_DNS}/orchestrator/health
# 기대: {"status":"healthy"}

# 2. CXR Service Health
curl http://${ALB_DNS}/cxr/healthz
# 기대: {"status":"ok"}

# 3. ECG Service Health
curl http://${ALB_DNS}/ecg/health
# 기대: {"status":"healthy"}

# 4. Lab Service Health
curl http://${ALB_DNS}/lab/health
# 기대: {"status":"healthy"}
```

---

## 프론트엔드 실행

### 1. 의존성 설치 (최초 1회)

```bash
cd say2-6-final/frontend
npm install
```

### 2. 프론트엔드 실행

**Windows:**
```cmd
start-frontend.bat
```

**Linux/Mac:**
```bash
./start-frontend.sh
```

**또는 직접 실행:**
```bash
npm run dev
```

### 3. 브라우저 접속

```
http://localhost:3000
```

### 4. 주요 페이지

| 페이지 | URL | 설명 |
|--------|-----|------|
| 홈페이지 | http://localhost:3000/ | 메인 페이지 |
| 제품 소개 | http://localhost:3000/product | 제품 설명 |
| Live Demo | http://localhost:3000/demo | 데모 시작 |
| Triage | http://localhost:3000/demo/triage | 환자 등록/트리아지 |
| Worklist | http://localhost:3000/demo/worklist | 검사 대기 목록 |
| Dashboard | http://localhost:3000/demo/dashboard | 대시보드 |

---

## 시연용 데모 케이스 테스트

### 시나리오 1: 정상 트리아지 플로우

#### 1단계: 환자 등록 (Triage Page)

**URL:** http://localhost:3000/demo/triage

**입력 데이터:**
```
환자 정보:
- 이름: 홍길동
- 나이: 45
- 성별: 남성

Vital Signs:
- 심박수(HR): 85 bpm
- 수축기혈압(SBP): 130 mmHg
- 이완기혈압(DBP): 85 mmHg
- 산소포화도(SpO2): 98%
- 호흡수(RR): 18 /min
- 체온(BT): 36.8°C

주 증상:
- Chief Complaint: chest_pain (흉통)

과거력:
- Past History: hypertension (고혈압)
```

**API 호출:**
```
POST /triage/submit
→ POST /orchestrator/triage/submit (ALB)
```

**기대 응답:**
```json
{
  "patient_id": "P-20260519-001",
  "encounter_id": "E-20260519-001",
  "primary_modality": "ECG",
  "all_modalities": ["ECG", "CXR", "LAB"],
  "risk_level": "moderate",
  "status": "active"
}
```

#### 2단계: AI 권고 확인 (Worklist Page)

**URL:** http://localhost:3000/demo/worklist

**API 호출:**
```
GET /encounters/{encounter_id}/service-requests
→ GET /orchestrator/encounters/{encounter_id}/service-requests
```

**기대 결과:**
- 1차 권고: ECG (흉통 → 심전도 우선)
- 2차 권고: CXR (흉부 X-ray)
- 3차 권고: LAB (혈액 검사)

#### 3단계: 검사 승인 및 실행

**Worklist에서 ECG 승인:**
```
POST /orders/{sr_id}/approve
→ POST /orchestrator/orders/{sr_id}/approve
```

**백엔드 동작:**
1. Orchestrator가 ECG Service 호출
2. ECG Service가 분석 수행
3. 결과를 Orchestrator로 반환
4. Orchestrator가 결과를 DB에 저장

#### 4단계: 검사 결과 확인

**API 호출:**
```
GET /encounters/{encounter_id}/modal-results
→ GET /orchestrator/encounters/{encounter_id}/modal-results
```

**기대 응답:**
```json
{
  "results": {
    "ECG": {
      "status": "completed",
      "findings": ["ST elevation in leads V1-V4"],
      "interpretation": "Possible anterior STEMI",
      "confidence": 0.92
    },
    "CXR": null,
    "LAB": null
  }
}
```

#### 5단계: AI 종합 소견 생성

**Dashboard에서 리포트 생성:**
```
POST /reports/{encounter_id}/generate
→ POST /orchestrator/reports/{encounter_id}/generate
```

**기대 응답:**
```json
{
  "report_id": 1,
  "status": "preliminary",
  "narrative": "45세 남성 환자, 흉통 주소로 내원...",
  "model_used": "claude-sonnet-4-6",
  "similar_cases": [...]
}
```

### 시나리오 2: MIMIC 데이터 활용

#### MIMIC 환자 데이터로 테스트

**Triage Page에서 MIMIC 옵션 선택:**
```json
{
  "mimic": {
    "subject_id": "10000032",
    "cxr_image_path": "p10/p10000032/s50414267/02aa804e-bde0afdd-112c0b34-7bc16630-4e384014.jpg",
    "ecg_record_path": "p10/p10000032/s50414267/ecg_record.dat"
  }
}
```

**장점:**
- 실제 의료 데이터로 테스트
- CXR 이미지 분석 가능
- ECG 파형 분석 가능

---

## 문제 해결

### 1. 백엔드 연결 실패

**증상:**
```
[v2/api] /triage/submit 연결 실패 (백엔드 미가동?)
```

**원인 및 해결:**

#### A. Security Group 이슈 (가장 가능성 높음)
```bash
# ALB Security Group 확인
aws ec2 describe-security-groups \
  --group-ids sg-0d702017416dadb66 \
  --region ap-northeast-2 \
  --query 'SecurityGroups[0].IpPermissions'

# HTTP Port 80 규칙이 없으면 보안팀에 요청
```

**해결:** `docs/보안팀_Security_Group_수정_요청.md` 참조

#### B. ECS Service 다운
```bash
# Service 상태 확인
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region ap-northeast-2 \
  --query 'services[0].[status,runningCount,desiredCount]'

# Task 로그 확인
aws logs tail /drai/central-backend --follow --region ap-northeast-2
```

**해결:** Service가 ACTIVE가 아니면 재배포 필요

#### C. Target Unhealthy
```bash
# Target Health 확인
TG_ARN=$(aws elbv2 describe-target-groups \
  --names say2-6team-orchestrator-tg \
  --region ap-northeast-2 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

aws elbv2 describe-target-health \
  --target-group-arn $TG_ARN \
  --region ap-northeast-2
```

**해결:** Unhealthy 원인 확인 (Health Check 실패, 컨테이너 크래시 등)

### 2. CORS 에러

**증상:**
```
Access to fetch at 'http://...' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**원인:**
- 백엔드에서 CORS 헤더 미설정

**해결:**
- Vite proxy를 통해 우회 (이미 설정됨)
- 백엔드에 CORS 미들웨어 추가 필요 시 개발팀에 요청

### 3. 프록시 경로 불일치

**증상:**
```
404 Not Found
```

**확인:**
```bash
# 프론트엔드 API 호출
/triage/submit

# Vite proxy rewrite
→ /orchestrator/triage/submit

# ALB Listener Rule
→ /orchestrator/* → Orchestrator Target Group

# 백엔드 실제 경로
→ /triage/submit (Orchestrator 내부)
```

**해결:**
- `vite.config.ts`의 rewrite 규칙 확인
- 백엔드 라우터 경로 확인

### 4. 환경 변수 미적용

**증상:**
- `.env.local` 수정했는데 반영 안 됨

**해결:**
```bash
# 개발 서버 재시작
Ctrl+C
npm run dev
```

### 5. 의존성 설치 오류

**증상:**
```
Module not found: Can't resolve 'react-router-dom'
```

**해결:**
```bash
# node_modules 삭제 후 재설치
rm -rf node_modules package-lock.json
npm install
```

---

## 다음 단계

### 1. Security Group 수정 요청
- [ ] `docs/보안팀_Security_Group_수정_요청.md` 문서를 보안팀(양정인)에게 전달
- [ ] HTTP Port 80 규칙 추가 완료 확인

### 2. 프론트엔드 테스트
- [ ] 프론트엔드 실행 (`npm run dev`)
- [ ] 백엔드 연결 확인 (Health Check)
- [ ] 시나리오 1 테스트 (정상 트리아지)
- [ ] 시나리오 2 테스트 (MIMIC 데이터)

### 3. 데모 케이스 준비
- [ ] 대표 케이스 3-5개 선정
- [ ] 각 케이스별 입력 데이터 정리
- [ ] 기대 결과 스크린샷 캡처
- [ ] 시연 시나리오 문서화

### 4. 프로덕션 전환 (3-6개월 후)
- [ ] 프론트엔드 v2 개발 완료
- [ ] 통합 테스트 완료
- [ ] ACM 인증서 발급 (보안팀)
- [ ] HTTPS Listener 추가 (컴퓨팅팀)
- [ ] HTTP → HTTPS 리다이렉트 설정

---

## 참고 문서

- [ECS 배포 가이드](./ECS_배포_가이드_README.md)
- [보안팀 Security Group 수정 요청](./보안팀_Security_Group_수정_요청.md)
- [프로덕션 전환 역할 분담](./프로덕션_전환_역할_분담.md)
- [현재 상황 요약](./현재_상황_요약.md)

---

## 문의

- **컴퓨팅팀 (이정인)**: ECS, 프론트엔드, 백엔드 연동
- **보안팀 (양정인)**: Security Group, WAF, 네트워크
- **개발팀**: 백엔드 API, 버그 수정
