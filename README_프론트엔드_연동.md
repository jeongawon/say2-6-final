# say2-6 프론트엔드 ECS 연동 완료

## 📌 현재 상태

### ✅ 완료
- ECS 배포 완료 (Orchestrator + 3개 Modal Services)
- 프론트엔드 설정 완료 (Vite proxy, 환경 변수)
- 문서화 완료 (가이드, 체크리스트, 빠른 참조)

### ⚠️ 대기 중
- **Security Group 수정 필요** (HTTP Port 80 규칙 추가)
- 보안팀(양정인)에게 요청 필요
- 이 작업 없이는 프론트엔드-백엔드 연동 불가

---

## 🚀 빠른 시작

### 1. Security Group 수정 요청 (긴급!)

```bash
# 문서 확인
cat docs/보안팀_Security_Group_수정_요청.md

# 보안팀(양정인)에게 전달
# - ALB Security Group (sg-0d702017416dadb66)
# - HTTP Port 80 인바운드 규칙 추가
# - 소스: 0.0.0.0/0
```

### 2. 프론트엔드 실행 (Security Group 수정 후)

```bash
cd say2-6-final/frontend
npm run dev
```

**접속:** http://localhost:3000

### 3. 데모 테스트

**Triage 페이지:** http://localhost:3000/demo/triage

**입력 예시:**
```
이름: 홍길동, 나이: 45, 성별: 남성
HR: 85, SBP: 130, DBP: 85, SpO2: 98, RR: 18, BT: 36.8
Chief: chest_pain
Past History: hypertension
```

---

## 📚 문서 구조

### 필수 문서 (지금 읽어야 할 것)

1. **[보안팀 Security Group 수정 요청](./docs/보안팀_Security_Group_수정_요청.md)** ⚠️
   - 긴급 요청 문서
   - 보안팀(양정인)에게 전달 필요
   - HTTP Port 80 규칙 추가 요청

2. **[데모 테스트 빠른 시작](./docs/데모_테스트_빠른_시작.md)** 🚀
   - 5분 안에 시작하는 방법
   - 데모 케이스 5개 포함
   - 문제 해결 가이드

3. **[빠른 참조 카드](./docs/빠른_참조_카드.md)** 📋
   - 자주 쓰는 명령어 모음
   - 데모 케이스 복사용
   - 긴급 연락처

### 상세 문서 (필요할 때 참조)

4. **[프론트엔드 ECS 연동 가이드](./docs/프론트엔드_ECS_연동_가이드.md)**
   - 전체 연동 과정 상세 설명
   - API 호출 구조 설명
   - 문제 해결 상세 가이드

5. **[프론트엔드 연동 완료 체크리스트](./docs/프론트엔드_연동_완료_체크리스트.md)**
   - 진행 상황 추적
   - 타임라인
   - 성공 기준

### 배경 문서 (팀원 공유용)

6. **[ECS 배포 가이드 README](./docs/ECS_배포_가이드_README.md)**
   - ECS 배포 전체 개요
   - 5부작 가이드 목차

7-11. **ECS 배포 가이드 1-5부**
   - 1부: 개요 및 사전 지식
   - 2부: 사전 요구사항 배포
   - 3부: Docker 이미지 빌드
   - 4부: ECS 컴퓨팅 스택 배포
   - 5부: 확인 및 문제 해결

12. **[프로덕션 전환 역할 분담](./docs/프로덕션_전환_역할_분담.md)**
   - 컴퓨팅팀 vs 보안팀 역할
   - 프로덕션 전환 타임라인 (3-6개월 후)

13. **[현재 상황 요약](./docs/현재_상황_요약.md)**
   - 프로젝트 전체 현황
   - 개발 단계 vs 프로덕션 단계

---

## 🎯 다음 단계

### 즉시 (오늘)
1. [ ] Security Group 수정 요청 (보안팀)
2. [ ] 프론트엔드 사전 준비 (`npm install`)
3. [ ] 백엔드 상태 확인 (ECS Service, Target Health)

### 단기 (1주일)
1. [ ] Security Group 수정 완료
2. [ ] 백엔드 연결 테스트
3. [ ] 데모 케이스 5개 테스트
4. [ ] 스크린샷/동영상 캡처
5. [ ] 시연 시나리오 최종 확인

### 중기 (1-3개월)
1. [ ] 프론트엔드 v2 개발 진행 상황 확인
2. [ ] 추가 데모 케이스 발굴
3. [ ] 성능 최적화 (필요 시)

### 장기 (3-6개월)
1. [ ] 프론트엔드 v2 완성
2. [ ] 통합 테스트
3. [ ] 프로덕션 전환 (HTTPS)

---

## 🔍 시스템 구성

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (v1)                        │
│              React + Vite (localhost:3000)              │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP Proxy
                         ↓
┌─────────────────────────────────────────────────────────┐
│              Application Load Balancer                  │
│  say2-6team-alb-698170641.ap-northeast-2.elb...        │
│                      Port 80 (HTTP)                     │
└──────┬──────────────┬──────────────┬──────────────┬─────┘
       │              │              │              │
       ↓              ↓              ↓              ↓
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│Orchestrator │ │ CXR Svc  │ │ ECG Svc  │ │ Lab Svc  │
│   (8000)    │ │  (8002)  │ │  (8001)  │ │  (8003)  │
│  2 tasks    │ │ 2 tasks  │ │ 2 tasks  │ │ 2 tasks  │
└─────────────┘ └──────────┘ └──────────┘ └──────────┘
       │              │              │              │
       └──────────────┴──────────────┴──────────────┘
                         │
                         ↓
              ┌──────────────────────┐
              │  Aurora Serverless   │
              │   PostgreSQL 15.5    │
              │   (central_db)       │
              └──────────────────────┘
```

### 주요 컴포넌트

| 컴포넌트 | 역할 | 상태 |
|----------|------|------|
| Frontend | React 기반 UI | ✅ 설정 완료 |
| ALB | 로드 밸런서 | ⚠️ Port 80 규칙 필요 |
| Orchestrator | 중앙 백엔드 | ✅ 배포 완료 (2 tasks) |
| CXR Service | 흉부 X-ray 분석 | ✅ 배포 완료 (2 tasks) |
| ECG Service | 심전도 분석 | ✅ 배포 완료 (2 tasks) |
| Lab Service | 혈액 검사 분석 | ✅ 배포 완료 (2 tasks) |
| Aurora | PostgreSQL DB | ✅ 배포 완료 |

---

## 🛠️ 기술 스택

### Frontend
- **Framework:** React 18.3
- **Build Tool:** Vite 6.0
- **Routing:** React Router 7.14
- **UI:** Tailwind CSS, Lucide Icons
- **Charts:** Recharts

### Backend
- **Orchestrator:** FastAPI (Python)
- **Modal Services:** FastAPI (Python)
- **AI Models:** ONNX Runtime
- **LLM:** AWS Bedrock (Claude Sonnet 4-6)

### Infrastructure
- **Compute:** ECS Fargate
- **Load Balancer:** Application Load Balancer
- **Database:** Aurora Serverless v2 (PostgreSQL 15.5)
- **Service Discovery:** AWS Cloud Map
- **Logging:** CloudWatch Logs
- **Security:** WAF, VPC, Security Groups

---

## 📊 API 엔드포인트

### Orchestrator (중앙 백엔드)
- `POST /orchestrator/triage/submit` - 환자 등록/트리아지
- `GET /orchestrator/encounters/{eid}/modal-results` - 검사 결과 조회
- `GET /orchestrator/encounters/{eid}/service-requests` - AI 권고 조회
- `POST /orchestrator/reports/{eid}/generate` - AI 종합 소견 생성
- `POST /orchestrator/orders/{sr_id}/approve` - 검사 승인
- `GET /orchestrator/health` - Health Check

### Modal Services (직접 접근)
- `POST /cxr/analyze` - CXR 분석
- `POST /ecg/analyze` - ECG 분석
- `POST /lab/analyze` - Lab 분석
- `GET /cxr/healthz` - CXR Health Check
- `GET /ecg/health` - ECG Health Check
- `GET /lab/health` - Lab Health Check

---

## 🔐 보안 구성

### 현재 (개발 단계)
- ✅ VPC Private Subnet (ECS Tasks)
- ✅ Security Groups (서비스별 분리)
- ✅ WAF (Count 모드)
- ⚠️ HTTP Port 80 (개발/테스트용)

### 프로덕션 (3-6개월 후)
- [ ] ACM 인증서 발급
- [ ] HTTPS Listener (Port 443)
- [ ] HTTP → HTTPS 리다이렉트
- [ ] WAF 규칙 활성화 (Block 모드)

---

## 📞 담당자

### 컴퓨팅팀 (이정인)
- ECS 배포 및 관리
- 프론트엔드 연동
- 백엔드 연동
- 시연 준비

### 보안팀 (양정인)
- Security Group 관리
- WAF 관리
- 네트워크 보안
- ACM 인증서 (프로덕션)

### 개발팀
- 백엔드 API 개발
- 버그 수정
- 기능 추가

---

## 🆘 문제 발생 시

### 1. 백엔드 연결 실패
→ [데모 테스트 빠른 시작](./docs/데모_테스트_빠른_시작.md) 참조

### 2. ECS Service 문제
→ [ECS 배포 가이드 5부](./docs/ECS_배포_가이드_5_확인및문제해결.md) 참조

### 3. 프론트엔드 빌드 오류
→ [프론트엔드 ECS 연동 가이드](./docs/프론트엔드_ECS_연동_가이드.md) 참조

### 4. Security Group 이슈
→ [보안팀 Security Group 수정 요청](./docs/보안팀_Security_Group_수정_요청.md) 참조

---

## ✅ 체크리스트

### 지금 바로
- [ ] Security Group 수정 요청 (보안팀)
- [ ] 프론트엔드 의존성 설치 (`npm install`)
- [ ] 백엔드 상태 확인

### Security Group 수정 후
- [ ] 백엔드 연결 테스트
- [ ] 프론트엔드 실행
- [ ] 데모 케이스 1개 테스트
- [ ] 전체 데모 케이스 테스트 (5개)
- [ ] 시연 준비

---

## 📝 버전 정보

- **프론트엔드:** v1 (say2-6-final/frontend)
- **백엔드:** ECS Fargate 배포 완료
- **문서:** 2026-05-19 작성
- **상태:** Security Group 수정 대기 중

---

**다음 문서:** [데모 테스트 빠른 시작](./docs/데모_테스트_빠른_시작.md) 🚀
