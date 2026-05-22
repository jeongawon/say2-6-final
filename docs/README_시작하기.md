# say2-6team 프로젝트 - 시작하기

> **프로젝트**: AI 기반 응급실 트리아지 시스템  
> **현재 상태**: ECS 배포 완료, Security Group 수정 대기 중  
> **날짜**: 2026-05-19

---

## 📊 현재 상황 한눈에 보기

```
┌─────────────────────────────────────────────────────────────┐
│                     현재 시스템 상태                          │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  프론트엔드 (localhost:3000)                                  │
│       │                                                       │
│       │ ❌ 연결 실패 (Security Group 차단)                    │
│       │                                                       │
│       ▼                                                       │
│  ALB (say2-6team-alb)                                        │
│       │                                                       │
│       │ ⚠️ Security Group: Port 443만 허용                   │
│       │    Port 80 필요! ← 여기가 문제!                      │
│       │                                                       │
│       ▼                                                       │
│  ECS Fargate (4 services)                                    │
│       │                                                       │
│       ├─ Orchestrator ✅ ACTIVE (2/2 tasks)                  │
│       ├─ CXR Service  ✅ ACTIVE (2/2 tasks)                  │
│       ├─ ECG Service  ✅ ACTIVE (2/2 tasks)                  │
│       └─ Lab Service  ✅ ACTIVE (2/2 tasks)                  │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 해결 방법 (3단계)

### 1️⃣ 보안팀에 요청 (5분)

**문서 전달:**
```
docs/보안팀_Security_Group_수정_요청.md
```

**요청 내용:**
- Security Group ID: `sg-0d702017416dadb66`
- 추가할 규칙: TCP Port 80, Source 0.0.0.0/0
- 이유: 프론트엔드 개발/데모 시연

### 2️⃣ Security Group 수정 대기 (10-30분)

**대기 중에 할 일:**
```bash
cd say2-6-final/frontend
npm install  # 의존성 설치 (최초 1회)
```

### 3️⃣ 수정 완료 후 테스트 (30분)

**백엔드 연결 테스트:**
```bash
curl http://say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com/orchestrator/health
```

**프론트엔드 실행:**
```bash
cd say2-6-final/frontend
start-frontend.bat  # Windows
# 또는
./start-frontend.sh  # Linux/Mac
```

**데모 케이스 테스트:**
- http://localhost:3000/demo/triage
- 환자 등록 → AI 권고 → 검사 승인 → 결과 확인

---

## 📚 문서 구조

### 🚨 긴급 문서 (지금 바로 읽기)

1. **[지금 해야 할 일](./지금_해야_할_일.md)** ⭐
   - 현재 상황 요약
   - 다음 단계 안내
   - 문제 해결 방법

2. **[빠른 명령어 참조](./빠른_명령어_참조.md)** ⭐
   - 복사-붙여넣기 명령어 모음
   - 테스트 명령어
   - 문제 해결 명령어

3. **[보안팀 Security Group 수정 요청](./보안팀_Security_Group_수정_요청.md)** ⭐
   - 보안팀 전달용 문서
   - 상세한 요청 내용
   - 보안 고려사항

### 📋 실행 가이드

4. **[데모 테스트 빠른 시작](./데모_테스트_빠른_시작.md)**
   - 5분 안에 시작하기
   - 데모 시나리오 5개
   - 문제 해결 방법

5. **[프론트엔드 연동 완료 체크리스트](./프론트엔드_연동_완료_체크리스트.md)**
   - 단계별 체크리스트
   - 성공 기준
   - 타임라인

### 📖 배경 문서

6. **[현재 상황 요약](./현재_상황_요약.md)**
   - 전체 프로젝트 현황
   - 장기 계획 (Phase 1-4)
   - 역할 분담

7. **[프로덕션 전환 역할 분담](./프로덕션_전환_역할_분담.md)**
   - 팀별 역할
   - HTTPS 전환 계획
   - 프로덕션 준비 사항

8. **[프로덕션 보안 기능 현황](./프로덕션_보안_기능_현황.md)**
   - ACM 인증서 상태
   - WAF 규칙 상태
   - HTTPS Listener 상태

### 🛠️ ECS 배포 가이드 (5부작)

9. **[ECS 배포 가이드 README](./ECS_배포_가이드_README.md)**
   - 전체 가이드 개요
   - 문서 구조

10. **[1부 - 개요](./ECS_배포_가이드_1_개요.md)**
    - 시스템 아키텍처
    - 주요 컴포넌트

11. **[2부 - 사전요구사항](./ECS_배포_가이드_2_사전요구사항.md)**
    - AWS 계정 설정
    - 필수 도구 설치

12. **[3부 - 이미지빌드](./ECS_배포_가이드_3_이미지빌드.md)**
    - Docker 이미지 빌드
    - ECR 푸시

13. **[4부 - 컴퓨팅배포](./ECS_배포_가이드_4_컴퓨팅배포.md)**
    - ECS Cluster 생성
    - Service 배포

14. **[5부 - 확인및문제해결](./ECS_배포_가이드_5_확인및문제해결.md)**
    - 배포 확인
    - 문제 해결

---

## 🔍 빠른 참조

### 주요 리소스 정보

| 리소스 | 값 |
|--------|-----|
| **ALB DNS** | `say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com` |
| **Security Group ID** | `sg-0d702017416dadb66` |
| **ECS Cluster** | `say2-6team-ecs-cluster` |
| **리전** | `ap-northeast-2` (서울) |
| **프론트엔드 URL** | `http://localhost:3000` |

### 주요 엔드포인트

| 서비스 | 엔드포인트 | Health Check |
|--------|-----------|--------------|
| **Orchestrator** | `/orchestrator/*` | `/orchestrator/health` |
| **CXR Service** | `/cxr/*` | `/cxr/healthz` |
| **ECG Service** | `/ecg/*` | `/ecg/health` |
| **Lab Service** | `/lab/*` | `/lab/health` |

### 빠른 테스트 명령어

```bash
# 1. Security Group 확인
aws ec2 describe-security-groups --group-ids sg-0d702017416dadb66 --region ap-northeast-2

# 2. 백엔드 Health Check
curl http://say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com/orchestrator/health

# 3. ECS Service 상태
aws ecs describe-services --cluster say2-6team-ecs-cluster --services say2-6team-orchestrator-service --region ap-northeast-2

# 4. 프론트엔드 실행
cd say2-6-final/frontend && npm run dev
```

---

## 💡 자주 묻는 질문 (FAQ)

### Q1: Redis/세션 스토리지는 구현되어 있나요?
**A:** 아니요, Phase 2로 미뤄졌습니다. 현재는 필요 없습니다.

### Q2: HTTPS는 언제 설정하나요?
**A:** 프론트엔드 완성 + 통합 테스트 완료 후 (3-6개월 후)

### Q3: 왜 지금 HTTP만 필요한가요?
**A:** 프론트엔드가 현재 개발 중이고, 테스트 데이터만 사용하므로 HTTP로 충분합니다.

### Q4: Security Group 수정은 누가 하나요?
**A:** 보안팀 (양정인)이 담당합니다.

### Q5: 프론트엔드는 어디에 있나요?
**A:** `say2-6-final/frontend/` 디렉토리입니다. (중앙 프론트 아님)

### Q6: 데모 케이스는 몇 개인가요?
**A:** 5개입니다. (흉통, 호흡곤란, 복통, 두통, 발열)

### Q7: 백엔드는 정상 작동 중인가요?
**A:** 네, ECS 서비스 4개 모두 ACTIVE 상태이고 Target Health도 healthy입니다.

### Q8: 언제 시연할 수 있나요?
**A:** Security Group 수정 후 즉시 가능합니다. (예상: 내일)

---

## 🎯 다음 단계 요약

```
┌─────────────────────────────────────────────────────────────┐
│                      다음 단계                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. 보안팀에 Security Group 수정 요청 (지금!)                 │
│     └─ 문서: docs/보안팀_Security_Group_수정_요청.md         │
│                                                               │
│  2. Security Group 수정 대기 (10-30분)                       │
│     └─ 대기 중: npm install 실행                             │
│                                                               │
│  3. 수정 완료 후 테스트 (30분)                               │
│     ├─ 백엔드 Health Check                                   │
│     ├─ 프론트엔드 실행                                        │
│     └─ 데모 케이스 테스트                                     │
│                                                               │
│  4. 시연 준비 (1주일)                                        │
│     ├─ 데모 케이스 5개 모두 테스트                           │
│     ├─ 스크린샷/동영상 캡처                                  │
│     └─ 시연 시나리오 최종 확인                               │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## 📞 연락처

| 담당자 | 역할 | 현재 작업 |
|--------|------|----------|
| **양정인 (yji)** | 네트워크, 보안 | Security Group 수정 대기 |
| **이정인 (lji)** | 컴퓨팅 | 백엔드 배포 완료, 프론트 연동 대기 |
| **프론트팀** | 프론트엔드 | 개발 중 (갈아엎는 중) |

---

## 🎉 결론

### 현재 상태
- ✅ 백엔드: ECS 배포 완료, 정상 작동 중
- ✅ 프론트엔드: 설정 완료, 실행 준비 완료
- ❌ 연동: Security Group이 HTTP Port 80을 차단 중

### 해결 방법
- 🔧 Security Group에 HTTP Port 80 규칙 추가 (보안팀, 5분)

### 그 다음
- 🚀 프론트엔드 실행 → 데모 테스트 → 시연 준비

### 장기 계획
- 📅 프론트엔드 완성 (수개월) → 통합 테스트 → HTTPS 전환 → 프로덕션 오픈

---

**지금 바로 시작하세요!**

1. `docs/지금_해야_할_일.md` 읽기
2. `docs/보안팀_Security_Group_수정_요청.md` 보안팀에 전달
3. Security Group 수정 완료 대기
4. `docs/데모_테스트_빠른_시작.md` 따라하기

---

**작성일:** 2026-05-19  
**작성자:** 컴퓨팅팀 (이정인)  
**버전:** 1.0

