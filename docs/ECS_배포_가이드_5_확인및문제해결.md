# ECS 배포 가이드 (5/5) - 배포 후 확인 및 트러블슈팅

> **이 단계의 목표**: 배포된 서비스 확인, 테스트, 문제 해결

---

## 📚 목차

1. [개요 및 사전 준비](./ECS_배포_가이드_1_개요.md)
2. [사전 요구사항 배포](./ECS_배포_가이드_2_사전요구사항.md)
3. [Docker 이미지 빌드 및 푸시](./ECS_배포_가이드_3_이미지빌드.md)
4. [ECS 컴퓨팅 스택 배포](./ECS_배포_가이드_4_컴퓨팅배포.md)
5. **[현재 문서] 배포 후 확인 및 트러블슈팅**

---

## 1. 배포 완료 후 대기 시간

ECS Service가 배포되면 즉시 사용 가능한 것이 아닙니다. 다음 과정을 거쳐야 합니다:

```
Task 시작 (0분)
    ↓
컨테이너 이미지 다운로드 (1-2분)
    ↓
컨테이너 시작 (30초)
    ↓
애플리케이션 초기화 (30초-1분)
    ↓
Health Check 통과 (1-2분)
    ↓
서비스 준비 완료 ✅ (총 3-5분)
```

**권장**: 배포 완료 후 **5분 대기** 후 테스트 시작

---

## 2. Health Check 엔드포인트 테스트

### 2.1 ALB DNS 확인

```bash
# CloudFormation Output에서 ALB DNS 가져오기
aws cloudformation describe-stacks \
  --stack-name say2-6team-compute \
  --region ap-northeast-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text

# 출력 예시:
# say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com
```

### 2.2 각 서비스 Health Check

#### Orchestrator Health Check

```bash
# 변수 설정 (위에서 확인한 ALB DNS로 변경)
ALB_DNS="say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com"

# Health Check
curl http://${ALB_DNS}/orchestrator/health

# 정상 응답 예시:
# {"status": "healthy", "service": "orchestrator", "timestamp": "2026-05-18T10:30:00Z"}
```

#### CXR Service Health Check

```bash
curl http://${ALB_DNS}/cxr/healthz

# 정상 응답 예시:
# {"status": "ok", "service": "cxr", "models_loaded": true}
```

#### ECG Service Health Check

```bash
curl http://${ALB_DNS}/ecg/health

# 정상 응답 예시:
# {"status": "healthy", "service": "ecg"}
```

#### Lab Service Health Check

```bash
curl http://${ALB_DNS}/lab/health

# 정상 응답 예시:
# {"status": "healthy", "service": "lab"}
```

### 2.3 브라우저에서 확인

브라우저에서 다음 URL을 열어서 확인:

```
http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/orchestrator/health
http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/cxr/healthz
http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/ecg/health
http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/lab/health
```

**정상**: JSON 응답이 표시됨  
**비정상**: 504 Gateway Timeout 또는 503 Service Unavailable

---

## 3. ECS Service 상태 확인

### 3.1 CLI로 Service 상태 확인

```bash
# 모든 Service 목록 및 상태
aws ecs list-services \
  --cluster say2-6team-ecs-cluster \
  --region ap-northeast-2

# 특정 Service 상세 정보
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region ap-northeast-2 \
  --query 'services[0].[serviceName,status,runningCount,desiredCount]' \
  --output table

# 출력 예시:
# -----------------------------------------------
# |            DescribeServices                 |
# +---------------------------------------------+
# |  say2-6team-orchestrator-service            |
# |  ACTIVE                                     |
# |  2                                          |
# |  2                                          |
# +---------------------------------------------+
```

**확인 사항**:
- `status`: `ACTIVE` 여야 함
- `runningCount`: `desiredCount`와 같아야 함 (2)

### 3.2 Task 상태 확인

```bash
# Orchestrator Service의 Task 목록
aws ecs list-tasks \
  --cluster say2-6team-ecs-cluster \
  --service-name say2-6team-orchestrator-service \
  --region ap-northeast-2

# Task 상세 정보
aws ecs describe-tasks \
  --cluster say2-6team-ecs-cluster \
  --tasks <TASK_ARN> \
  --region ap-northeast-2 \
  --query 'tasks[0].[taskArn,lastStatus,healthStatus,containers[0].name]' \
  --output table
```

**Task 상태**:
- `lastStatus`: `RUNNING` 여야 함
- `healthStatus`: `HEALTHY` 여야 함

### 3.3 AWS Console에서 확인

1. **ECS** 콘솔로 이동
2. **Clusters** → `say2-6team-ecs-cluster`
3. **Services** 탭:
   - 4개 Service 모두 `ACTIVE` 상태
   - Running tasks: 2/2

4. 각 Service 클릭 → **Tasks** 탭:
   - 2개 Task 모두 `RUNNING` 상태
   - Health status: `HEALTHY`

5. Task 클릭 → **Logs** 탭:
   - 애플리케이션 로그 확인
   - 에러 메시지 확인

---

## 4. Target Group Health 확인

### 4.1 CLI로 확인

```bash
# Target Group ARN 가져오기
TG_ARN=$(aws elbv2 describe-target-groups \
  --names say2-6team-orchestrator-tg \
  --region ap-northeast-2 \
  --query 'TargetGroups[0].TargetGroupArn' \
  --output text)

# Target Health 확인
aws elbv2 describe-target-health \
  --target-group-arn ${TG_ARN} \
  --region ap-northeast-2 \
  --query 'TargetHealthDescriptions[*].[Target.Id,TargetHealth.State,TargetHealth.Reason]' \
  --output table

# 출력 예시:
# -----------------------------------------------
# |         DescribeTargetHealth                |
# +---------------------------------------------+
# |  10.0.1.123  |  healthy  |                  |
# |  10.0.2.234  |  healthy  |                  |
# +---------------------------------------------+
```

**정상 상태**: 모든 Target이 `healthy`

**비정상 상태**:
- `initial`: 초기 Health Check 중 (1-2분 대기)
- `unhealthy`: Health Check 실패 (문제 해결 필요)
- `draining`: Task 종료 중

### 4.2 AWS Console에서 확인

1. **EC2** 콘솔로 이동
2. 왼쪽 메뉴 → **Target Groups**
3. 각 Target Group 클릭:
   - `say2-6team-orchestrator-tg`
   - `say2-6team-cxr-svc-tg`
   - `say2-6team-ecg-svc-tg`
   - `say2-6team-lab-svc-tg`

4. **Targets** 탭:
   - 2개 Target 모두 `healthy` 상태 확인

---

## 5. CloudWatch Logs 확인

### 5.1 CLI로 로그 확인

```bash
# Orchestrator 로그 (최근 10분)
aws logs tail /drai/central-backend \
  --since 10m \
  --follow \
  --region ap-northeast-2

# CXR Service 로그
aws logs tail /drai/modal/cxr \
  --since 10m \
  --follow \
  --region ap-northeast-2

# ECG Service 로그
aws logs tail /drai/modal/ecg \
  --since 10m \
  --follow \
  --region ap-northeast-2

# Lab Service 로그
aws logs tail /drai/modal/lab \
  --since 10m \
  --follow \
  --region ap-northeast-2
```

**확인 사항**:
- 애플리케이션 시작 로그
- 에러 메시지 없는지
- Health Check 요청 로그

### 5.2 AWS Console에서 확인

1. **CloudWatch** 콘솔로 이동
2. 왼쪽 메뉴 → **Logs** → **Log groups**
3. Log Group 선택:
   - `/drai/central-backend`
   - `/drai/modal/cxr`
   - `/drai/modal/ecg`
   - `/drai/modal/lab`

4. Log Stream 선택 (최신 것)
5. 로그 내용 확인

---

## 6. 일반적인 문제 및 해결 방법

### 문제 1: Task가 계속 재시작됨

**증상**:
- Task가 `RUNNING` → `STOPPED` → `PENDING` → `RUNNING` 반복
- Desired count는 2인데 Running count가 0 또는 1

**원인 1**: 애플리케이션 크래시
```bash
# 로그 확인
aws logs tail /drai/central-backend --since 30m --region ap-northeast-2

# Python 에러, 메모리 부족 등 확인
```

**원인 2**: Health Check 실패
```bash
# Task Definition의 Health Check 설정 확인
aws ecs describe-task-definition \
  --task-definition say2-6team-orchestrator-task \
  --region ap-northeast-2 \
  --query 'taskDefinition.containerDefinitions[0].healthCheck'
```

**해결 방법**:
- 로그에서 에러 원인 파악
- 코드 수정 후 재배포
- Health Check 경로 확인 (`/health`, `/healthz`)

### 문제 2: 504 Gateway Timeout

**증상**:
- Health Check 엔드포인트 호출 시 504 에러
- 브라우저에서 "Gateway Timeout" 표시

**원인**: Target이 unhealthy 상태

**해결 방법**:
```bash
# 1. Target Health 확인
aws elbv2 describe-target-health \
  --target-group-arn <TG_ARN> \
  --region ap-northeast-2

# 2. Task 상태 확인
aws ecs describe-tasks \
  --cluster say2-6team-ecs-cluster \
  --tasks <TASK_ARN> \
  --region ap-northeast-2

# 3. 로그 확인
aws logs tail /drai/central-backend --since 10m --region ap-northeast-2

# 4. Task 재시작 (강제)
aws ecs update-service \
  --cluster say2-6team-ecs-cluster \
  --service say2-6team-orchestrator-service \
  --force-new-deployment \
  --region ap-northeast-2
```

### 문제 3: 503 Service Unavailable

**증상**:
- Health Check 엔드포인트 호출 시 503 에러

**원인**: Target Group에 등록된 Target이 없음

**해결 방법**:
```bash
# Service 상태 확인
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region ap-northeast-2

# Running count가 0이면 Task가 시작되지 않은 것
# Events 확인:
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region ap-northeast-2 \
  --query 'services[0].events[0:5]'
```

### 문제 4: 이미지를 가져올 수 없음

**증상**:
- Task가 `PENDING` 상태에서 멈춤
- 로그: "CannotPullContainerError"

**원인**: ECR 이미지가 없거나 권한 부족

**해결 방법**:
```bash
# 1. ECR 이미지 확인
aws ecr describe-images \
  --repository-name say2-6team-orchestrator \
  --region ap-northeast-2

# 2. 이미지가 없으면 다시 빌드 및 푸시
cd infra
bash build-and-push.sh

# 3. IAM Role 권한 확인
aws iam get-role \
  --role-name say2-6team-ecs-execution-role \
  --region ap-northeast-2
```

### 문제 5: 메모리 부족 (OOM)

**증상**:
- Task가 갑자기 종료됨
- 로그: "OutOfMemoryError" 또는 "Killed"

**원인**: Task Definition의 메모리 설정이 부족

**해결 방법**:
```bash
# 현재 메모리 설정 확인
aws ecs describe-task-definition \
  --task-definition say2-6team-cxr-svc-task \
  --region ap-northeast-2 \
  --query 'taskDefinition.memory'

# CXR Service는 8GB 필요
# compute-stack.yaml에서 메모리 증가 후 재배포
```

### 문제 6: 데이터베이스 연결 실패

**증상**:
- 로그: "Connection refused" 또는 "Unable to connect to database"

**원인**: Aurora DB 연결 정보 오류 또는 Security Group 문제

**해결 방법**:
```bash
# 1. Aurora Endpoint 확인
aws rds describe-db-clusters \
  --db-cluster-identifier say2-6team-aurora-cluster \
  --region ap-northeast-2 \
  --query 'DBClusters[0].Endpoint'

# 2. Security Group 확인
# Orchestrator SG → Aurora SG (Port 5432) 허용되어 있는지

# 3. Task Definition의 환경 변수 확인
aws ecs describe-task-definition \
  --task-definition say2-6team-orchestrator-task \
  --region ap-northeast-2 \
  --query 'taskDefinition.containerDefinitions[0].environment'
```

---

## 7. 서비스 간 통신 테스트

### 7.1 Service Discovery 확인

```bash
# Orchestrator Task에 접속하여 내부 DNS 확인
# (ECS Exec 활성화 필요)

# 또는 CloudWatch Logs에서 확인
aws logs tail /drai/central-backend --since 10m --region ap-northeast-2 | grep "cxr-svc"

# Orchestrator가 CXR Service를 호출하는 로그 확인
# 예: "Calling CXR service at http://cxr-svc.say2-6team.local:8002"
```

### 7.2 실제 API 호출 테스트

```bash
# Orchestrator를 통해 CXR 분석 요청 (예시)
curl -X POST http://${ALB_DNS}/orchestrator/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "TEST001",
    "modality": "cxr",
    "image_url": "https://example.com/test.jpg"
  }'

# 정상 응답 예시:
# {
#   "request_id": "abc123",
#   "status": "processing",
#   "estimated_time": 30
# }
```

---

## 8. 모니터링 및 알람 설정

### 8.1 CloudWatch 메트릭 확인

```bash
# ECS Service CPU 사용률
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=say2-6team-orchestrator-service Name=ClusterName,Value=say2-6team-ecs-cluster \
  --start-time 2026-05-18T00:00:00Z \
  --end-time 2026-05-18T23:59:59Z \
  --period 3600 \
  --statistics Average \
  --region ap-northeast-2
```

### 8.2 주요 모니터링 메트릭

| 메트릭 | 정상 범위 | 경고 임계값 |
|--------|----------|-----------|
| CPU 사용률 | 30-60% | > 80% |
| 메모리 사용률 | 40-70% | > 85% |
| Target Health | 100% healthy | < 100% |
| Response Time | < 500ms | > 2000ms |
| Error Rate | < 1% | > 5% |

---

## 9. 배포 롤백

문제가 해결되지 않으면 이전 버전으로 롤백:

### 9.1 CloudFormation Stack 롤백

```bash
# Stack 삭제 (주의: 모든 리소스 삭제됨)
aws cloudformation delete-stack \
  --stack-name say2-6team-compute \
  --region ap-northeast-2

# 삭제 완료 대기
aws cloudformation wait stack-delete-complete \
  --stack-name say2-6team-compute \
  --region ap-northeast-2
```

### 9.2 특정 Service만 롤백

```bash
# 이전 Task Definition으로 롤백
aws ecs update-service \
  --cluster say2-6team-ecs-cluster \
  --service say2-6team-orchestrator-service \
  --task-definition say2-6team-orchestrator-task:1 \
  --region ap-northeast-2

# Task Definition 버전 확인
aws ecs list-task-definitions \
  --family-prefix say2-6team-orchestrator-task \
  --region ap-northeast-2
```

---

## 10. 유용한 명령어 모음

### 10.1 빠른 상태 확인

```bash
# 모든 Service 상태 한 번에 확인
for service in orchestrator-service cxr-svc-service ecg-svc-service lab-svc-service; do
  echo "=== say2-6team-${service} ==="
  aws ecs describe-services \
    --cluster say2-6team-ecs-cluster \
    --services say2-6team-${service} \
    --region ap-northeast-2 \
    --query 'services[0].[serviceName,status,runningCount,desiredCount]' \
    --output table
done
```

### 10.2 모든 로그 동시 확인

```bash
# 여러 터미널에서 실행
aws logs tail /drai/central-backend --follow --region ap-northeast-2
aws logs tail /drai/modal/cxr --follow --region ap-northeast-2
aws logs tail /drai/modal/ecg --follow --region ap-northeast-2
aws logs tail /drai/modal/lab --follow --region ap-northeast-2
```

### 10.3 Service 강제 재배포

```bash
# 모든 Service 재배포
for service in orchestrator-service cxr-svc-service ecg-svc-service lab-svc-service; do
  echo "Redeploying say2-6team-${service}..."
  aws ecs update-service \
    --cluster say2-6team-ecs-cluster \
    --service say2-6team-${service} \
    --force-new-deployment \
    --region ap-northeast-2
done
```

---

## 11. 최종 체크리스트

배포가 성공적으로 완료되었는지 확인:

- [ ] 4개 Service 모두 `ACTIVE` 상태
- [ ] 각 Service마다 2개 Task `RUNNING` 상태
- [ ] 모든 Target Group에서 Target이 `healthy` 상태
- [ ] Health Check 엔드포인트 모두 정상 응답
- [ ] CloudWatch Logs에 에러 없음
- [ ] 서비스 간 통신 정상 (Service Discovery)
- [ ] 실제 API 호출 테스트 성공
- [ ] ALB DNS를 프론트엔드에 설정

---

## 12. 다음 단계

배포가 완료되었습니다! 이제 다음 작업을 진행하세요:

1. **프론트엔드 설정**
   - ALB DNS를 프론트엔드 환경 변수에 설정
   - API 엔드포인트 테스트

2. **도메인 설정** (선택사항)
   - Route 53에서 도메인 등록
   - ALB에 도메인 연결
   - HTTPS 인증서 설정 (ACM)

3. **모니터링 설정**
   - CloudWatch Dashboard 생성
   - 알람 설정 (CPU, 메모리, 에러율)
   - SNS 알림 설정

4. **CI/CD 파이프라인 구축**
   - GitHub Actions 또는 CodePipeline
   - 자동 빌드 및 배포

5. **보안 강화**
   - WAF 규칙 활성화
   - VPC Flow Logs 활성화
   - GuardDuty 활성화

---

## 13. 추가 리소스

### AWS 공식 문서
- [ECS 개발자 가이드](https://docs.aws.amazon.com/ecs/)
- [Fargate 사용 가이드](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [ALB 사용 가이드](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)

### 트러블슈팅 가이드
- [ECS 트러블슈팅](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/troubleshooting.html)
- [Fargate 트러블슈팅](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-troubleshooting.html)

### 팀 내부 문서
- [AWS 아키텍처 설계 문서](../AWS/AWS_Compute_Design_v1.md)
- [AWS 구현 가이드](../AWS/AWS_Implementation_Guide.md)

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)

---

## 🎉 축하합니다!

ECS 배포를 성공적으로 완료했습니다! 

질문이나 문제가 있으면 팀 채널 `#infra-ecs`에 문의하세요.
