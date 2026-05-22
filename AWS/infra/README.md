# say2-6team Infrastructure

## 📁 파일 구조

```
infra/
├── 1-iam-stack.yaml                    # IAM 역할 정의
├── 2-security-stack.yaml               # 보안 그룹 정의 (개발용)
├── 3-service-discovery-stack.yaml      # Cloud Map 설정
├── compute-stack.yaml                  # ECS 클러스터 및 서비스
├── compute-stack-params.json           # 컴퓨팅 스택 파라미터
├── deploy-prerequisites.sh             # 사전 요구사항 자동 배포
├── deploy-compute.sh                   # 컴퓨팅 스택 자동 배포
├── build-and-push.sh                   # Docker 빌드 및 ECR 푸시
├── DEPLOYMENT_STEPS.md                 # 상세 배포 가이드
├── DEPLOYMENT_GUIDE.md                 # 기존 배포 가이드
├── INFRASTRUCTURE_ANALYSIS.md          # 인프라 분석 문서
└── task-definitions/                   # ECS Task Definition JSON
    ├── orchestrator-task.json
    ├── cxr-svc-task.json
    ├── ecg-svc-task.json
    └── lab-svc-task.json
```

---

## 🚀 빠른 시작

### **전체 배포 (처음부터)**

```bash
# 1. 네트워크 스택 (양정인)
cd ../AWS/network
aws cloudformation create-stack \
  --stack-name say2-6team-network-stack \
  --template-body file://network-stack.yaml \
  --region us-east-1
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-network-stack \
  --region us-east-1

# 2. 사전 요구사항 (IAM, Security, Service Discovery)
cd ../../infra
bash deploy-prerequisites.sh

# 3. ECR 리포지토리 생성
aws ecr create-repository --repository-name say2-6team-orchestrator --region us-east-1
aws ecr create-repository --repository-name say2-6team-cxr-svc --region us-east-1
aws ecr create-repository --repository-name say2-6team-ecg-svc --region us-east-1
aws ecr create-repository --repository-name say2-6team-lab-svc --region us-east-1

# 4. Docker 이미지 빌드 및 푸시
bash build-and-push.sh

# 5. 컴퓨팅 스택 배포
bash deploy-compute.sh
```

---

## 📋 배포 순서

```
네트워크 스택
    ↓
IAM 스택
    ↓
보안 스택
    ↓
Service Discovery 스택
    ↓
ECR 리포지토리
    ↓
Docker 이미지 빌드 & 푸시
    ↓
컴퓨팅 스택
```

---

## 🔑 핵심 개념

### **스택 분리 이유**

1. **IAM 스택**: 역할 관리를 독립적으로
2. **보안 스택**: 보안 정책을 나중에 쉽게 업데이트
3. **Service Discovery 스택**: DNS 네임스페이스 관리
4. **컴퓨팅 스택**: ECS 서비스 및 ALB

### **Export/Import 구조**

각 스택은 다른 스택이 사용할 수 있도록 값을 Export합니다:

```yaml
# 1-iam-stack.yaml
Outputs:
  ECSExecutionRoleArn:
    Export:
      Name: say2-6team-ecs-execution-role-arn

# compute-stack.yaml
Resources:
  TaskDefinition:
    Properties:
      ExecutionRoleArn: !ImportValue say2-6team-ecs-execution-role-arn
```

---

## 🎯 포트 매핑

| 서비스 | 포트 | 헬스체크 경로 |
|--------|------|---------------|
| Orchestrator | 8000 | /health |
| CXR Service | 8002 | /healthz |
| ECG Service | 8001 | /health |
| Lab Service | 8003 | /health |

---

## 🔒 보안 설정

### **현재 (개발 단계)**

- VPC 내부 통신 허용
- ALB는 인터넷에서 접근 가능
- 모든 아웃바운드 트래픽 허용

### **나중에 강화 (보안팀)**

```bash
# 보안 스택만 업데이트
aws cloudformation update-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://2-security-stack-enhanced.yaml \
  --region us-east-1
```

**강화 사항:**
- 포트별 세밀한 제어
- 특정 IP 대역만 허용
- WAF 연동
- VPC Endpoint 사용

---

## 🧪 테스트

### **헬스체크**

```bash
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text \
  --region us-east-1)

curl http://$ALB_DNS/orchestrator/health
curl http://$ALB_DNS/cxr/healthz
curl http://$ALB_DNS/ecg/health
curl http://$ALB_DNS/lab/health
```

### **서비스 간 통신 테스트**

```bash
# ECS 태스크에 접속해서 테스트
aws ecs execute-command \
  --cluster say2-6team-ecs-cluster \
  --task <TASK_ID> \
  --container orchestrator \
  --interactive \
  --command "/bin/bash"

# 태스크 내부에서
curl http://ecg-svc.say2-6team.local:8001/health
curl http://cxr-svc.say2-6team.local:8002/healthz
curl http://lab-svc.say2-6team.local:8003/health
```

---

## 📊 모니터링

### **CloudWatch Logs**

```bash
# 실시간 로그 확인
aws logs tail /drai/central-backend --follow --region us-east-1
aws logs tail /drai/modal/cxr --follow --region us-east-1
aws logs tail /drai/modal/ecg --follow --region us-east-1
aws logs tail /drai/modal/lab --follow --region us-east-1
```

### **ECS 서비스 상태**

```bash
# 서비스 목록
aws ecs list-services \
  --cluster say2-6team-ecs-cluster \
  --region us-east-1

# 서비스 상세 정보
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region us-east-1
```

---

## 🔄 업데이트

### **새 이미지 배포**

```bash
# 1. 새 이미지 빌드 및 푸시
bash build-and-push.sh

# 2. ECS 서비스 강제 업데이트
aws ecs update-service \
  --cluster say2-6team-ecs-cluster \
  --service say2-6team-orchestrator-service \
  --force-new-deployment \
  --region us-east-1
```

### **스택 업데이트**

```bash
# 보안 스택 업데이트
aws cloudformation update-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://2-security-stack-v2.yaml \
  --region us-east-1

# 컴퓨팅 스택 업데이트
aws cloudformation update-stack \
  --stack-name say2-6team-compute-stack \
  --template-body file://compute-stack.yaml \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

---

## 🗑️ 삭제

```bash
# 역순으로 삭제
aws cloudformation delete-stack --stack-name say2-6team-compute-stack --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name say2-6team-compute-stack --region us-east-1

aws cloudformation delete-stack --stack-name say2-6team-service-discovery-stack --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name say2-6team-service-discovery-stack --region us-east-1

aws cloudformation delete-stack --stack-name say2-6team-security-stack --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name say2-6team-security-stack --region us-east-1

aws cloudformation delete-stack --stack-name say2-6team-iam-stack --region us-east-1
aws cloudformation wait stack-delete-complete --stack-name say2-6team-iam-stack --region us-east-1

aws cloudformation delete-stack --stack-name say2-6team-network-stack --region us-east-1
```

---

## 📚 상세 문서

- **[DEPLOYMENT_STEPS.md](./DEPLOYMENT_STEPS.md)**: 단계별 상세 배포 가이드
- **[INFRASTRUCTURE_ANALYSIS.md](./INFRASTRUCTURE_ANALYSIS.md)**: 인프라 분석 및 비용 추정
- **[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)**: 기존 배포 가이드

---

## 📞 담당자

- **네트워크**: 양정인 (wja)
- **컴퓨팅**: 이정인 (lji)
- **보안**: 한태균 (hkt)
- **프론트엔드**: 전체 팀

---

## ❓ FAQ

### Q: 보안 스택을 나중에 바꿔도 되나요?
A: 네! 보안 스택만 업데이트하면 됩니다. 컴퓨팅 스택은 건드릴 필요 없습니다.

### Q: ECR 이미지를 업데이트하려면?
A: `build-and-push.sh` 실행 후 ECS 서비스를 `--force-new-deployment`로 업데이트하세요.

### Q: 비용은 얼마나 나오나요?
A: 개발 환경 기준 월 $200-300 예상. 자세한 내용은 INFRASTRUCTURE_ANALYSIS.md 참고.

### Q: 스택 삭제 시 주의사항은?
A: 반드시 역순으로 삭제해야 합니다. 의존성 때문에 순서가 중요합니다.
