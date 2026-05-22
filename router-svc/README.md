# Router Service

## 개요

Router Service는 Orchestrator가 다운됐을 때 의사의 직접 action을 각 모달 서비스로 라우팅하는 **stateless 프록시 서비스**입니다.

## 특징

- ✅ **Stateless**: DB 연결 없음, 세션 없음
- ✅ **단순 프록시**: 요청을 받아서 적절한 모달 서비스로 전달만
- ✅ **판단 없음**: Bedrock 호출 없음, 비즈니스 로직 없음
- ✅ **고가용성**: ECS Fargate 2개 태스크, Multi-AZ 배치

## 아키텍처

```
Client → ALB (/route/*) → Router Service → Modal Services
                                          ├─ ECG Service
                                          ├─ CXR Service
                                          ├─ LAB Service
                                          └─ RAG Service
```

## 엔드포인트

### 라우팅 엔드포인트

- `POST /route/ecg` - ECG 서비스로 프록시
- `POST /route/cxr` - CXR 서비스로 프록시
- `POST /route/lab` - LAB 서비스로 프록시
- `POST /route/rag` - RAG 서비스로 프록시

### 헬스체크 엔드포인트

- `GET /health` - ALB 헬스체크
- `GET /ready` - Readiness probe
- `GET /` - 서비스 정보

## 환경변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `HOST` | `0.0.0.0` | 서버 호스트 |
| `PORT` | `8004` | 서버 포트 |
| `LOG_LEVEL` | `INFO` | 로그 레벨 |
| `ECG_SVC_URL` | `http://ecg-svc.say2-6team.local:8001` | ECG 서비스 URL |
| `CXR_SVC_URL` | `http://cxr-svc.say2-6team.local:8002` | CXR 서비스 URL |
| `LAB_SVC_URL` | `http://lab-svc.say2-6team.local:8003` | LAB 서비스 URL |
| `RAG_SVC_URL` | `http://rag-svc.say2-6team.local:8000` | RAG 서비스 URL |
| `REQUEST_TIMEOUT` | `300` | 요청 타임아웃 (초) |

## 로컬 실행

### 1. 의존성 설치

```bash
pip install -r requirements.txt
```

### 2. 실행

```bash
bash run_local.sh
```

또는

```bash
python main.py
```

### 3. 테스트

```bash
# 헬스체크
curl http://localhost:8004/health

# 서비스 정보
curl http://localhost:8004/

# ECG 프록시 테스트 (ECG 서비스가 실행 중이어야 함)
curl -X POST http://localhost:8004/route/ecg \
  -H "Content-Type: application/json" \
  -d '{"s3_key": "test.csv"}'
```

## Docker 빌드

```bash
docker build -t router-svc:latest .
```

## ECR 배포

```bash
bash deploy.sh [IMAGE_TAG]
```

예시:
```bash
bash deploy.sh v1.0.0
bash deploy.sh latest
```

## CloudFormation 배포

### 1. Security Stack 업데이트

```bash
aws cloudformation update-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://AWS/Security/security-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-2
```

### 2. Compute Stack 업데이트

```bash
aws cloudformation update-stack \
  --stack-name say2-6team-compute-stack \
  --template-body file://AWS/infra/compute-stack.yaml \
  --parameters \
    ParameterKey=RouterSvcImageUri,ParameterValue=<ECR_IMAGE_URI> \
    ParameterKey=OrchestratorImageUri,UsePreviousValue=true \
    ParameterKey=CxrSvcImageUri,UsePreviousValue=true \
    ParameterKey=EcgSvcImageUri,UsePreviousValue=true \
    ParameterKey=LabSvcImageUri,UsePreviousValue=true \
  --region ap-northeast-2
```

## 모니터링

### CloudWatch Logs

로그 그룹: `/drai/router`

### 주요 로그 메시지

- `Proxying request to {service_name}` - 프록시 요청 시작
- `{service_name} responded successfully` - 프록시 성공
- `{service_name} returned error` - 대상 서비스 오류
- `{service_name} request timeout` - 타임아웃
- `Cannot connect to {service_name}` - 연결 실패

## 트러블슈팅

### 1. 대상 서비스 연결 실패

**증상**: `503 Cannot connect to ECG Service`

**원인**:
- 대상 서비스가 실행 중이 아님
- Security Group 규칙 누락
- Cloud Map DNS 미등록

**해결**:
1. 대상 서비스 상태 확인
2. Security Group Ingress/Egress 규칙 확인
3. Cloud Map 서비스 디스커버리 확인

### 2. 타임아웃

**증상**: `504 ECG Service request timeout after 300s`

**원인**:
- 대상 서비스 응답 지연
- 네트워크 문제

**해결**:
1. `REQUEST_TIMEOUT` 환경변수 증가
2. 대상 서비스 성능 확인

### 3. 헬스체크 실패

**증상**: ECS 태스크가 계속 재시작됨

**원인**:
- `/health` 엔드포인트 응답 실패
- 포트 8004 바인딩 실패

**해결**:
1. 로그 확인: `/drai/router`
2. 포트 충돌 확인
3. 컨테이너 재시작

## 제약사항

- ❌ DB 연결 없음
- ❌ Bedrock 호출 불가
- ❌ 비즈니스 로직 없음
- ❌ 판단(judgment) 수행 불가
- ✅ 단순 프록시만 수행

## 라이선스

MIT
