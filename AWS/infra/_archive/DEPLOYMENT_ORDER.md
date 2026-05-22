# say2-6team 배포 순서 (us-east-1)

## 📋 **전체 배포 순서 요약**

```
1. 네트워크 스택 (양정인)
   ↓
2. IAM 스택 (이정인)
   ↓
3. 보안 스택 (이정인)
   ↓
4. ECR 리포지토리 생성 (이정인)
   ↓
5. Docker 이미지 빌드 & 푸시 (이정인)
   ↓
6. 컴퓨팅 스택 배포 (이정인)
   ↓
7. Aurora DB 스택 배포 (한태균)
   ↓
8. 모니터링 스택 배포 (한태균)
   ↓
9. 헬스체크 & 테스트
   ↓
10. WebSocket 구현 (전체 팀)
```

---

## 🚀 **Step-by-Step 배포**

### **Step 1: 네트워크 스택 배포** (양정인 담당)

```bash
cd AWS/network

aws cloudformation create-stack \
  --stack-name say2-6team-network-stack \
  --template-body file://network-stack.yaml \
  --region us-east-1 \
  --tags \
    Key=Project,Value=say2-6team \
    Key=Owner,Value=yji \
    Key=Environment,Value=dev

# 완료 대기 (약 5-7분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-network-stack \
  --region us-east-1

# 상태 확인
aws cloudformation describe-stacks \
  --stack-name say2-6team-network-stack \
  --region us-east-1 \
  --query 'Stacks[0].StackStatus'
```

**생성되는 리소스:**
- VPC (10.0.0.0/16)
- 8개 서브넷 (Public x2, App x2, Data x2, Endpoint x2)
- Internet Gateway
- Route Tables (6개)
- VPC Endpoints (S3, Bedrock, Secrets Manager, KMS, CloudWatch Logs, ECR)
- Cloud Map Namespace (say2-6team.local) ✅
- VPC Flow Logs (S3 저장)

**Export 확인:**
```bash
aws cloudformation list-exports \
  --region us-east-1 \
  --query 'Exports[?starts_with(Name, `say2-6team`)].Name'
```

**예상 Exports:**
- say2-6team-vpc-id
- say2-6team-vpc-cidr
- say2-6team-public-subnet-a
- say2-6team-public-subnet-c
- say2-6team-private-app-subnet-a
- say2-6team-private-app-subnet-c
- say2-6team-private-data-subnet-a
- say2-6team-private-data-subnet-c
- say2-6team-endpoints-subnet-a
- say2-6team-endpoints-subnet-c
- say2-6team-endpoints-sg
- say2-6team-cloud-map-namespace-id ✅

---

### **Step 2: IAM 스택 배포** (이정인 담당)

```bash
cd ../../infra

aws cloudformation create-stack \
  --stack-name say2-6team-iam-stack \
  --template-body file://1-iam-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1 \
  --tags \
    Key=Project,Value=say2-6team \
    Key=Owner,Value=lji \
    Key=Environment,Value=dev

# 완료 대기 (약 2-3분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-iam-stack \
  --region us-east-1
```

**생성되는 리소스:**
- ECS Execution Role (1개)
- Task Roles (4개: Orchestrator, CXR, ECG, Lab)

**Export 확인:**
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-iam-stack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[].ExportName'
```

---

### **Step 3: 보안 스택 배포** (이정인 담당)

```bash
aws cloudformation create-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://2-security-stack.yaml \
  --region us-east-1 \
  --tags \
    Key=Project,Value=say2-6team \
    Key=Owner,Value=lji \
    Key=Environment,Value=dev

# 완료 대기 (약 2-3분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-security-stack \
  --region us-east-1
```

**생성되는 리소스:**
- ALB Security Group (인터넷 → ALB)
- Central Services Security Group (ALB → ECS)

**Export 확인:**
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-security-stack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[].ExportName'
```

**예상 Exports:**
- say2-6team-alb-sg
- say2-6team-central-sg

---

### **Step 4: ECR 리포지토리 생성** (이정인 담당)

```bash
# 리포지토리 존재 확인
aws ecr describe-repositories --region us-east-1

# 없으면 생성
aws ecr create-repository \
  --repository-name say2-6team-orchestrator \
  --region us-east-1 \
  --tags Key=Project,Value=say2-6team Key=Owner,Value=lji

aws ecr create-repository \
  --repository-name say2-6team-cxr-svc \
  --region us-east-1 \
  --tags Key=Project,Value=say2-6team Key=Owner,Value=lji

aws ecr create-repository \
  --repository-name say2-6team-ecg-svc \
  --region us-east-1 \
  --tags Key=Project,Value=say2-6team Key=Owner,Value=lji

aws ecr create-repository \
  --repository-name say2-6team-lab-svc \
  --region us-east-1 \
  --tags Key=Project,Value=say2-6team Key=Owner,Value=lji
```

---

### **Step 5: Docker 이미지 빌드 및 푸시** (이정인 담당)

```bash
# build-and-push.sh 스크립트 실행
bash build-and-push.sh
```

**스크립트가 하는 일:**
1. ECR 로그인
2. 각 서비스 Docker 이미지 빌드
3. ECR에 푸시
4. `compute-stack-params.json` 자동 업데이트

**예상 소요 시간:** 10-20분

---

### **Step 6: 컴퓨팅 스택 배포** (이정인 담당)

```bash
# compute-stack-params.json 확인
cat compute-stack-params.json

# 스택 배포
aws cloudformation create-stack \
  --stack-name say2-6team-compute-stack \
  --template-body file://compute-stack.yaml \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region us-east-1 \
  --tags \
    Key=Project,Value=say2-6team \
    Key=Owner,Value=lji \
    Key=Environment,Value=dev

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
- Service Discovery Services (4개)

---

### **Step 7: ALB DNS 확인 및 헬스체크**

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

---

### **Step 8: Aurora DB 스택 배포** (한태균 담당)

**⚠️ 주의: Aurora YAML 파일들은 CloudFormation 형식이 아닙니다!**

현재 `AWS/aurora-serverless/*.yaml` 파일들은 설계 문서 형식입니다.
CloudFormation 템플릿으로 변환이 필요합니다.

**임시 해결책 - 수동 생성:**

```bash
# 1. Secrets Manager에 DB 자격증명 생성
aws secretsmanager create-secret \
  --name say2-6team/aurora-credentials \
  --description "Aurora PostgreSQL credentials" \
  --secret-string '{"username":"admin","password":"CHANGE_ME_STRONG_PASSWORD"}' \
  --region us-east-1

# 2. Aurora Serverless v2 클러스터 생성 (콘솔 또는 CLI)
# - Engine: PostgreSQL 16.4
# - Capacity: 0.5 ~ 4.0 ACU
# - VPC: say2-6team-vpc
# - Subnets: say2-6team-private-data-subnet-a, say2-6team-private-data-subnet-c
# - Security Group: 새로 생성 (say2-6team-aurora-sg)
# - Database name: drai_ops

# 3. 스키마 마이그레이션
# Aurora 엔드포인트 확인 후
psql -h <aurora-endpoint> -U admin -d drai_ops -f ../AWS/aurora-serverless/migrations.yaml
```

**또는 CloudFormation 템플릿 생성 필요** (제가 만들어드릴 수 있습니다)

---

### **Step 9: 모니터링 스택 배포** (한태균 담당)

**⚠️ 주의: 모니터링 YAML 파일들도 설계 문서 형식입니다!**

CloudFormation 템플릿으로 변환이 필요합니다.

**임시 해결책 - 수동 생성:**

```bash
# CloudWatch Log Groups는 compute-stack에서 이미 생성됨
# 추가 작업:
# 1. SNS 토픽 생성 (알림용)
# 2. CloudWatch Alarms 생성
# 3. CloudTrail 설정
# 4. EventBridge Rules 생성
```

---

## ✅ **배포 후 확인 사항**

### **1. 네트워크 스택 확인**
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-network-stack \
  --region us-east-1 \
  --query 'Stacks[0].StackStatus'
```

### **2. IAM 스택 확인**
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-iam-stack \
  --region us-east-1 \
  --query 'Stacks[0].StackStatus'
```

### **3. 보안 스택 확인**
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-security-stack \
  --region us-east-1 \
  --query 'Stacks[0].StackStatus'
```

### **4. 컴퓨팅 스택 확인**
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --region us-east-1 \
  --query 'Stacks[0].StackStatus'
```

### **5. ECS 서비스 상태 확인**
```bash
aws ecs list-services \
  --cluster say2-6team-ecs-cluster \
  --region us-east-1

aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region us-east-1 \
  --query 'services[0].runningCount'
```

---

## 🚨 **트러블슈팅**

### **문제: VPC Import 실패**
```bash
# Export 확인
aws cloudformation list-exports --region us-east-1 | grep say2-6team
```

### **문제: ECS 태스크 시작 실패**
```bash
# 태스크 실패 이유 확인
aws ecs describe-tasks \
  --cluster say2-6team-ecs-cluster \
  --tasks <TASK_ARN> \
  --region us-east-1
```

### **문제: ALB 헬스체크 실패**
```bash
# Target Group 상태 확인
aws elbv2 describe-target-health \
  --target-group-arn <TG_ARN> \
  --region us-east-1
```

---

## 📞 **담당자**

- **네트워크**: 양정인 (yji)
- **컴퓨팅**: 이정인 (lji)
- **DB/모니터링**: 한태균 (hkt)
- **전체 조율**: 팀 전체

---

## 📝 **다음 단계**

1. ✅ 네트워크 스택 배포
2. ✅ IAM 스택 배포
3. ✅ 보안 스택 배포
4. ⏳ ECR 생성 → Docker 빌드 → 컴퓨팅 스택 배포
5. ⏳ Aurora DB 설정 (CloudFormation 템플릿 필요)
6. ⏳ 모니터링 설정 (CloudFormation 템플릿 필요)
7. ⏳ WebSocket 구현
8. ⏳ 데모 케이스 준비
