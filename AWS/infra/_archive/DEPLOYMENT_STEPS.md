# say2-6team 배포 가이드

## 📋 전체 배포 순서

```
1. 네트워크 스택 (양정인)
   ↓
2. IAM 스택 (자동)
   ↓
3. 보안 스택 (자동)
   ↓
4. Service Discovery 스택 (자동)
   ↓
5. ECR 리포지토리 생성 (이정인)
   ↓
6. Docker 이미지 빌드 & 푸시 (이정인)
   ↓
7. 컴퓨팅 스택 배포 (이정인)
   ↓
8. 헬스체크 테스트
   ↓
9. WebSocket 구현 (전체 팀)
   ↓
10. 데모 케이스 준비 (전체 팀)
```

---

## 🚀 Step-by-Step 배포

### **Step 1: 네트워크 인프라 구축** (양정인 담당)

```bash
cd AWS/network

aws cloudformation create-stack \
  --stack-name say2-6team-network-stack \
  --template-body file://network-stack.yaml \
  --region us-east-1

# 완료 대기 (약 3-5분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-network-stack \
  --region us-east-1

# 상태 확인
aws cloudformation describe-stacks \
  --stack-name say2-6team-network-stack \
  --region us-east-1
```

**생성되는 리소스:**
- VPC (10.0.0.0/16)
- Public Subnets (2개, Multi-AZ)
- Private App Subnets (2개, Multi-AZ)
- Private Data Subnets (2개, Multi-AZ)
- Internet Gateway
- NAT Gateways (2개)
- Route Tables

---

### **Step 2: 사전 요구사항 스택 배포** (이정인 담당)

```bash
cd infra

# 자동 배포 스크립트 실행
bash deploy-prerequisites.sh
```

**또는 수동 배포:**

```bash
# 2-1. IAM 스택
aws cloudformation create-stack \
  --stack-name say2-6team-iam-stack \
  --template-body file://1-iam-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-iam-stack \
  --region us-east-1

# 2-2. 보안 스택
aws cloudformation create-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://2-security-stack.yaml \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-security-stack \
  --region us-east-1

# 2-3. Service Discovery 스택
aws cloudformation create-stack \
  --stack-name say2-6team-service-discovery-stack \
  --template-body file://3-service-discovery-stack.yaml \
  --region us-east-1

aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-service-discovery-stack \
  --region us-east-1
```

**생성되는 리소스:**
- ECS Execution Role
- Task Roles (Orchestrator, CXR, ECG, Lab)
- ALB Security Group
- Central Services Security Group
- Cloud Map Namespace (say2-6team.local)

---

### **Step 3: ECR 리포지토리 생성** (이정인 담당)

```bash
# 리포지토리 존재 확인
aws ecr describe-repositories --region us-east-1

# 없으면 생성
aws ecr create-repository \
  --repository-name say2-6team-orchestrator \
  --region us-east-1

aws ecr create-repository \
  --repository-name say2-6team-cxr-svc \
  --region us-east-1

aws ecr create-repository \
  --repository-name say2-6team-ecg-svc \
  --region us-east-1

aws ecr create-repository \
  --repository-name say2-6team-lab-svc \
  --region us-east-1
```

---

### **Step 4: Docker 이미지 빌드 및 푸시** (이정인 담당)

```bash
cd infra

# build-and-push.sh 스크립트 실행
bash build-and-push.sh
```

**스크립트가 하는 일:**
1. ECR 로그인
2. 각 서비스 Docker 이미지 빌드
3. ECR에 푸시
4. `compute-stack-params.json` 자동 업데이트

**예상 소요 시간:** 10-20분 (서비스별 빌드 시간)

---

### **Step 5: 컴퓨팅 스택 배포** (이정인 담당)

```bash
cd infra

# 자동 배포 스크립트 실행
bash deploy-compute.sh
```

**또는 수동 배포:**

```bash
# compute-stack-params.json 확인 (ECR 이미지 URI가 업데이트되었는지)
cat compute-stack-params.json

# 스택 배포
aws cloudformation create-stack \
  --stack-name say2-6team-compute-stack \
  --template-body file://compute-stack.yaml \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region us-east-1

# 완료 대기 (약 10-15분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-compute-stack \
  --region us-east-1
```

**생성되는 리소스:**
- ECS Cluster
- Application Load Balancer
- Target Groups (4개)
- ECS Services (4개)
- Task Definitions (4개)
- CloudWatch Log Groups
- Service Discovery Services

---

### **Step 6: ALB DNS 확인 및 테스트**

```bash
# ALB DNS 이름 가져오기
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text \
  --region us-east-1)

echo "ALB DNS: $ALB_DNS"

# 2-3분 대기 (서비스가 healthy 상태가 될 때까지)
sleep 180

# 헬스체크 테스트
curl http://$ALB_DNS/orchestrator/health
curl http://$ALB_DNS/cxr/healthz
curl http://$ALB_DNS/ecg/health
curl http://$ALB_DNS/lab/health
```

**예상 응답:**
```json
{"status": "healthy"}
```

---

### **Step 7: ECS 서비스 상태 확인**

```bash
# ECS 클러스터 서비스 목록
aws ecs list-services \
  --cluster say2-6team-ecs-cluster \
  --region us-east-1

# 각 서비스 상세 정보
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region us-east-1

# 실행 중인 태스크 확인
aws ecs list-tasks \
  --cluster say2-6team-ecs-cluster \
  --service-name say2-6team-orchestrator-service \
  --region us-east-1
```

---

### **Step 8: CloudWatch Logs 확인**

```bash
# Orchestrator 로그
aws logs tail /drai/central-backend --follow --region us-east-1

# CXR 서비스 로그
aws logs tail /drai/modal/cxr --follow --region us-east-1

# ECG 서비스 로그
aws logs tail /drai/modal/ecg --follow --region us-east-1

# Lab 서비스 로그
aws logs tail /drai/modal/lab --follow --region us-east-1
```

---

## 🔧 WebSocket 구현 (Step 9)

### **9-1. Orchestrator WebSocket 엔드포인트 추가**

`final/central/main.py`에 WebSocket 지원 추가:

```python
from fastapi import WebSocket

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    # WebSocket 로직 구현
```

### **9-2. ALB Sticky Session 설정**

```bash
# Orchestrator Target Group에 Sticky Session 활성화
aws elbv2 modify-target-group-attributes \
  --target-group-arn <ORCHESTRATOR_TG_ARN> \
  --attributes \
    Key=stickiness.enabled,Value=true \
    Key=stickiness.type,Value=lb_cookie \
    Key=stickiness.lb_cookie.duration_seconds,Value=86400 \
  --region us-east-1
```

### **9-3. 프론트엔드 WebSocket 클라이언트**

```typescript
const ws = new WebSocket(`ws://${ALB_DNS}/ws`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // 진행 상황 업데이트
};
```

---

## 🧪 데모 케이스 준비 (Step 10)

### **10-1. MIMIC 데이터 추출**

```bash
# S3에서 샘플 데이터 다운로드
aws s3 cp s3://say2-6team-data/mimic-samples/ ./demo-data/ --recursive

# 10건 선별 (CXR, ECG, Lab 데이터가 모두 있는 케이스)
python scripts/select_demo_cases.py --count 10 --output demo-cases.json
```

### **10-2. 프론트엔드 데모 셀렉터 구현**

```typescript
const demoCases = [
  { id: 1, name: "Case 1: Pneumonia", ... },
  { id: 2, name: "Case 2: Arrhythmia", ... },
  // ...
];
```

### **10-3. End-to-End 테스트**

```bash
# 테스트 스크립트 실행
python scripts/e2e_test.py --alb-dns $ALB_DNS --demo-cases demo-cases.json
```

---

## 📊 배포 후 확인 사항

### ✅ 체크리스트

- [ ] 네트워크 스택 배포 완료
- [ ] IAM 스택 배포 완료
- [ ] 보안 스택 배포 완료
- [ ] Service Discovery 스택 배포 완료
- [ ] ECR 리포지토리 생성 완료
- [ ] Docker 이미지 빌드 및 푸시 완료
- [ ] 컴퓨팅 스택 배포 완료
- [ ] ALB 헬스체크 통과
- [ ] ECS 서비스 모두 RUNNING 상태
- [ ] CloudWatch Logs 정상 출력
- [ ] WebSocket 연결 테스트 성공
- [ ] 데모 케이스 E2E 테스트 통과

---

## 🚨 트러블슈팅

### **문제: ECS 태스크가 시작되지 않음**

```bash
# 태스크 실패 이유 확인
aws ecs describe-tasks \
  --cluster say2-6team-ecs-cluster \
  --tasks <TASK_ARN> \
  --region us-east-1
```

**일반적인 원인:**
- ECR 이미지 URI 오류
- IAM 권한 부족
- 메모리/CPU 부족
- 헬스체크 실패

### **문제: ALB 헬스체크 실패**

```bash
# Target Group 상태 확인
aws elbv2 describe-target-health \
  --target-group-arn <TG_ARN> \
  --region us-east-1
```

**일반적인 원인:**
- 보안 그룹 규칙 오류
- 헬스체크 경로 불일치
- 서비스 시작 시간 부족 (StartPeriod 조정 필요)

### **문제: 서비스 간 통신 실패**

```bash
# Cloud Map 서비스 확인
aws servicediscovery list-services \
  --region us-east-1

# DNS 해석 테스트 (ECS 태스크 내부에서)
nslookup ecg-svc.say2-6team.local
```

---

## 🔄 스택 업데이트

### **보안 스택 업데이트 (나중에)**

```bash
# 보안팀이 작성한 새 템플릿으로 업데이트
aws cloudformation update-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://2-security-stack-enhanced.yaml \
  --region us-east-1
```

### **컴퓨팅 스택 업데이트**

```bash
# 새 이미지 배포 시
aws cloudformation update-stack \
  --stack-name say2-6team-compute-stack \
  --template-body file://compute-stack.yaml \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region us-east-1
```

---

## 🗑️ 전체 삭제 (필요 시)

```bash
# 역순으로 삭제
aws cloudformation delete-stack --stack-name say2-6team-compute-stack --region us-east-1
aws cloudformation delete-stack --stack-name say2-6team-service-discovery-stack --region us-east-1
aws cloudformation delete-stack --stack-name say2-6team-security-stack --region us-east-1
aws cloudformation delete-stack --stack-name say2-6team-iam-stack --region us-east-1
aws cloudformation delete-stack --stack-name say2-6team-network-stack --region us-east-1
```

---

## 📞 담당자

- **네트워크**: 양정인 (wja)
- **컴퓨팅**: 이정인 (lji)
- **보안**: 한태균 (hkt) - 나중에 강화
- **전체 조율**: 팀 전체

---

## 📚 참고 문서

- [AWS ECS 공식 문서](https://docs.aws.amazon.com/ecs/)
- [AWS CloudFormation 공식 문서](https://docs.aws.amazon.com/cloudformation/)
- [프로젝트 README](../README.md)
- [인프라 분석 문서](./INFRASTRUCTURE_ANALYSIS.md)
