# say2-6 프론트엔드 실행 가이드 - ECS 백엔드 연동

> **목표**: say2-6 메인 프론트엔드를 로컬에서 실행하고 ECS 백엔드와 연동하여 데모 시연

---

## 📖 프론트엔드 구조

say2-6 프론트엔드는 3가지 주요 섹션으로 구성되어 있습니다:

### 1. 🌐 브랜드 사이트 (마케팅)
- **홈페이지** (`/`)
- **제품 소개** (`/product`, `/product/ecg`, `/product/cxr`, `/product/lab`)
- **기술 소개** (`/technology`)
- **팀 소개** (`/team`)
- **문의하기** (`/contact`)

### 2. 🩺 Live Demo (실제 시스템)
- **로그인** (`/demo`, `/demo/login`)
- **Triage** (`/demo/triage`) - 환자 등록 및 중증도 분류
- **Worklist** (`/demo/worklist`) - 환자 목록
- **Dashboard** (`/demo/dashboard`) - 관리자 대시보드
- **환자 상세** (`/demo/patient/:id`)
- **소견서 작성** (`/demo/patient/:id/report`)
- **소견서 조회** (`/demo/reports`)

### 3. 📦 Legacy EMR (기존 시스템)
- `/legacy/*` 경로로 접근 가능
- 점진적으로 v2로 마이그레이션 예정

---

## 🚀 빠른 시작 (3단계)

### 1단계: 프론트엔드 디렉토리로 이동

```bash
cd frontend
```

### 2단계: 실행 스크립트 실행

**Windows**:
```cmd
start-frontend.bat
```

**Mac/Linux 또는 Git Bash**:
```bash
chmod +x start-frontend.sh
bash start-frontend.sh
```

### 3단계: 브라우저에서 확인

자동으로 브라우저가 열리거나, 수동으로 다음 주소를 열어주세요:

```
http://localhost:3000
```

---

## 📋 주요 페이지 및 데모 시나리오

### 시나리오 1: 브랜드 사이트 둘러보기

1. **홈페이지** (`http://localhost:3000/`)
   - say2-6 소개
   - 히어로 비디오
   - 주요 기능 소개

2. **제품 페이지** (`http://localhost:3000/product`)
   - ECG, CXR, Lab 서비스 소개
   - 각 모달별 상세 페이지

3. **기술 페이지** (`http://localhost:3000/technology`)
   - AI 기술 설명
   - 아키텍처 소개

### 시나리오 2: Live Demo - 환자 등록부터 소견서까지

#### Step 1: 로그인
```
http://localhost:3000/demo
```
- 데모 모드: 역할 선택 (의사/간호사/관리자)
- Cognito 미설정 시 자동으로 데모 모드로 작동

#### Step 2: Triage (환자 등록)
```
http://localhost:3000/demo/triage
```
- 환자 정보 입력
- 중증도 분류
- 검사 주문 (ECG, CXR, Lab)

**백엔드 API 호출**:
```
POST /orchestrator/triage/submit
{
  "patient_name": "홍길동",
  "age": 45,
  "chief_complaint": "흉통",
  "vital_signs": {...}
}
```

#### Step 3: Worklist (환자 목록)
```
http://localhost:3000/demo/worklist
```
- 등록된 환자 목록 조회
- 중증도별 필터링
- 환자 상세 페이지로 이동

**백엔드 API 호출**:
```
GET /orchestrator/encounters
```

#### Step 4: 환자 상세 페이지
```
http://localhost:3000/demo/patient/:id
```
- 환자 기본 정보
- 검사 결과 (ECG, CXR, Lab)
- AI 분석 결과
- 소견서 작성 버튼

**백엔드 API 호출**:
```
GET /orchestrator/encounters/:id
GET /orchestrator/orders?encounter_id=:id
```

#### Step 5: 소견서 작성
```
http://localhost:3000/demo/patient/:id/report
```
- AI 추천 소견 표시
- 의사가 수정/승인
- 최종 소견서 생성

**백엔드 API 호출**:
```
POST /orchestrator/reports
{
  "encounter_id": "...",
  "findings": "...",
  "impression": "...",
  "recommendations": "..."
}
```

#### Step 6: 소견서 조회
```
http://localhost:3000/demo/reports
```
- 작성된 소견서 목록
- PDF 다운로드
- 인쇄

**백엔드 API 호출**:
```
GET /orchestrator/reports
GET /orchestrator/reports/:id
```

### 시나리오 3: Dashboard (관리자)
```
http://localhost:3000/demo/dashboard
```
- 실시간 통계
- 환자 현황
- 검사 현황
- 시스템 상태

---

## 🔧 백엔드 API 연동 확인

### 개발자 도구에서 확인

1. `F12` 키로 개발자 도구 열기
2. **Console** 탭에서 테스트:

```javascript
// Health Check
fetch("/orchestrator/health")
  .then(res => res.json())
  .then(data => console.log("Health:", data));

// Encounters 조회
fetch("/orchestrator/encounters")
  .then(res => res.json())
  .then(data => console.log("Encounters:", data));
```

3. **Network** 탭에서 API 요청 확인:
   - Request URL
   - Status Code (200 OK)
   - Response Data

---

## 📸 데모 시연 체크리스트

### 사전 준비
- [ ] Node.js 18 이상 설치
- [ ] ECS 백엔드 정상 실행 확인
- [ ] 프론트엔드 의존성 설치 완료
- [ ] 개발 서버 실행 성공

### 브랜드 사이트
- [ ] 홈페이지 정상 표시
- [ ] 히어로 비디오 재생
- [ ] 제품 페이지 이동
- [ ] 각 모달 상세 페이지 확인

### Live Demo
- [ ] 로그인 페이지 접속
- [ ] 역할 선택 (데모 모드)
- [ ] Triage 페이지에서 환자 등록
- [ ] Worklist에서 환자 목록 확인
- [ ] 환자 상세 페이지 확인
- [ ] 검사 결과 표시 확인
- [ ] 소견서 작성 페이지 확인
- [ ] Dashboard 통계 확인

### 백엔드 연동
- [ ] Health Check API 성공
- [ ] Encounters API 성공
- [ ] Orders API 성공
- [ ] Reports API 성공
- [ ] Network 탭에서 200 OK 확인
- [ ] Console에 에러 없음

---

## 🎬 발표용 데모 시나리오

### 5분 데모 (핵심만)

1. **홈페이지 소개** (30초)
   - say2-6 소개
   - 주요 기능 강조

2. **Live Demo 로그인** (10초)
   - 의사 역할 선택

3. **Triage - 환자 등록** (1분)
   - 환자 정보 입력
   - 중증도 자동 분류
   - 검사 주문 (ECG, CXR, Lab)

4. **Worklist - 환자 목록** (30초)
   - 등록된 환자 확인
   - 중증도별 색상 구분

5. **환자 상세 - AI 분석 결과** (2분)
   - ECG 분석 결과 표시
   - CXR 분석 결과 표시
   - Lab 분석 결과 표시
   - AI 추천 소견

6. **소견서 작성** (1분)
   - AI 추천 소견 확인
   - 의사가 수정
   - 최종 승인

7. **Dashboard - 통계** (30초)
   - 실시간 환자 현황
   - 검사 현황

### 10분 데모 (상세)

위 5분 데모 + 추가:

8. **제품 페이지** (1분)
   - ECG, CXR, Lab 각 모달 소개

9. **기술 페이지** (1분)
   - AI 기술 설명
   - 아키텍처 소개

10. **개발자 도구** (1분)
    - Network 탭에서 API 호출 확인
    - ECS 백엔드 연동 강조

11. **ECS Console** (1분)
    - AWS Console에서 실제 컨테이너 실행 확인
    - Multi-AZ 고가용성 강조

12. **CloudWatch Logs** (1분)
    - 실시간 로그 확인
    - AI 분석 과정 로그

---

## 🔍 백엔드 API 엔드포인트

### Orchestrator API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/orchestrator/health` | GET | Health Check |
| `/orchestrator/triage/submit` | POST | 환자 등록 |
| `/orchestrator/encounters` | GET | 환자 목록 조회 |
| `/orchestrator/encounters/:id` | GET | 환자 상세 조회 |
| `/orchestrator/orders` | GET | 검사 주문 조회 |
| `/orchestrator/orders` | POST | 검사 주문 생성 |
| `/orchestrator/reports` | GET | 소견서 목록 조회 |
| `/orchestrator/reports/:id` | GET | 소견서 상세 조회 |
| `/orchestrator/reports` | POST | 소견서 생성 |

### 모달 서비스 API

| 엔드포인트 | 메서드 | 설명 |
|-----------|--------|------|
| `/cxr/healthz` | GET | CXR Health Check |
| `/cxr/analyze` | POST | 흉부 X-ray 분석 |
| `/ecg/health` | GET | ECG Health Check |
| `/ecg/analyze` | POST | 심전도 분석 |
| `/lab/health` | GET | Lab Health Check |
| `/lab/analyze` | POST | 혈액검사 분석 |

---

## ❌ 문제 해결

### 문제 1: 백엔드 API 호출 실패

**증상**:
- Network 탭에서 404 또는 500 에러
- Console에 "Failed to fetch" 에러

**해결**:
```bash
# 1. ECS Service 상태 확인
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region ap-northeast-2

# 2. Target Health 확인
aws elbv2 describe-target-health \
  --target-group-arn <TG_ARN> \
  --region ap-northeast-2

# 3. 로그 확인
aws logs tail /drai/central-backend --since 10m --region ap-northeast-2
```

### 문제 2: CORS 에러

**증상**:
```
Access to fetch at '...' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**해결**:
- Orchestrator 백엔드에서 CORS 설정 필요
- FastAPI의 경우:
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### 문제 3: 페이지가 비어있음

**증상**:
- 브라우저에 빈 화면만 표시
- Console에 에러 메시지

**해결**:
```bash
# 1. 의존성 재설치
rm -rf node_modules package-lock.json
npm install

# 2. 캐시 삭제
npm cache clean --force

# 3. 개발 서버 재시작
npm run dev
```

### 문제 4: 환경 변수가 적용되지 않음

**증상**:
- `.env.local` 수정했는데 반영 안 됨

**해결**:
```bash
# 개발 서버 재시작 필요
# Ctrl+C로 중단 후
npm run dev
```

---

## 🎨 UI/UX 특징

### 디자인 시스템
- **Tailwind CSS** 사용
- **Lucide React** 아이콘
- **Recharts** 차트 라이브러리
- 반응형 디자인 (모바일/태블릿/데스크톱)

### 주요 컴포넌트
- `Layout` - 전체 레이아웃
- `RequireAuth` - 인증 가드
- `AuthProvider` - 인증 컨텍스트
- 각 페이지별 전용 컴포넌트

---

## 📦 프로덕션 빌드

### 빌드 실행

```bash
npm run build
```

**출력**:
```
vite v6.0.5 building for production...
✓ 234 modules transformed.
dist/index.html                   1.23 kB │ gzip:  0.56 kB
dist/assets/index-abc123.css     45.21 kB │ gzip: 12.34 kB
dist/assets/index-def456.js     543.21 kB │ gzip: 156.78 kB
✓ built in 8.45s
```

### S3 + CloudFront 배포

```bash
# dist 폴더를 S3에 업로드
aws s3 sync dist/ s3://say2-6-frontend/ --delete

# CloudFront 캐시 무효화
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

---

## 📚 추가 리소스

### 프로젝트 문서
- [ECS 배포 가이드](./ECS_배포_가이드_README.md)
- [백엔드 API 문서](../final/central/backend/README.md)

### 외부 문서
- [React 공식 문서](https://react.dev/)
- [Vite 공식 문서](https://vitejs.dev/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)

---

## 🎉 준비 완료!

이제 프론트엔드를 실행하고 멋진 데모를 시연하세요! 💪

질문이나 문제가 있으면 팀 채널 `#frontend` 또는 `#infra-ecs`에 문의하세요.
