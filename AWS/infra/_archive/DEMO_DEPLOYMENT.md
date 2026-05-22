# say2-6team 시연용 배포 가이드 (간소화 버전)

## 🎯 **목표**
Aurora DB와 모니터링 스택 없이 **최소 구성으로 빠르게 시연 환경 구축**

---

## 📋 **배포 순서**

### **Step 1: 네트워크 스택 배포** (양정인)

```bash
cd AWS/network

aws cloudformation create-stack \
  --stack-name say2-6team-network-stack \
  --template-body file://network-stack.yaml \
  --region us-east-1

# 완료 대기 (약 5-7분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-network-stack \
  --region us-east-1

echo "✅ Network stack deployed!"
```

---

### **Step 2: IAM 스택 배포** (이정인)

```bash
cd ../../infra

aws cloudformation create-stack \
  --stack-name say2-6team-iam-stack \
  --template-body file://1-iam-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region us-east-1

# 완료 대기 (약 2-3분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-iam-stack \
  --region us-east-1

echo "✅ IAM stack deployed!"
```

---

### **Step 3: 보안 스택 배포** (이정인)

```bash
aws cloudformation create-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://2-security-stack.yaml \
  --region us-east-1

# 완료 대기 (약 2-3분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-security-stack \
  --region us-east-1

echo "✅ Security stack deployed!"
```

---

### **Step 4: ECR 리포지토리 생성** (이정인)

```bash
# 4개 리포지토리 생성
for repo in orchestrator cxr-svc ecg-svc lab-svc; do
  aws ecr create-repository \
    --repository-name say2-6team-$repo \
    --region us-east-1 \
    --tags Key=Project,Value=say2-6team Key=Owner,Value=lji \
    2>/dev/null || echo "Repository say2-6team-$repo already exists"
done

echo "✅ ECR repositories ready!"
```

---

### **Step 5: Docker 이미지 빌드 및 푸시** (이정인)

```bash
# build-and-push.sh 스크립트 실행
bash build-and-push.sh

# 예상 소요 시간: 10-20분
```

**스크립트가 없다면 수동으로:**

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1

# ECR 로그인
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# Orchestrator 빌드 & 푸시
cd ../final/central
docker build -t say2-6team-orchestrator .
docker tag say2-6team-orchestrator:latest \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-orchestrator:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-orchestrator:latest

# CXR 서비스 빌드 & 푸시
cd ../../chest-svc-pre
docker build -t say2-6team-cxr-svc .
docker tag say2-6team-cxr-svc:latest \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-cxr-svc:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-cxr-svc:latest

# ECG 서비스 빌드 & 푸시
cd ../ECG-svc
docker build -t say2-6team-ecg-svc .
docker tag say2-6team-ecg-svc:latest \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-ecg-svc:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-ecg-svc:latest

# Lab 서비스 빌드 & 푸시
cd ../Lab-svc
docker build -t say2-6team-lab-svc .
docker tag say2-6team-lab-svc:latest \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-lab-svc:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-lab-svc:latest

echo "✅ All images pushed to ECR!"
```

---

### **Step 6: compute-stack-params.json 업데이트** (이정인)

```bash
cd ../../infra

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1

# params 파일 생성
cat > compute-stack-params.json <<EOF
[
  {
    "ParameterKey": "ProjectName",
    "ParameterValue": "say2-6team"
  },
  {
    "ParameterKey": "Environment",
    "ParameterValue": "dev"
  },
  {
    "ParameterKey": "Owner",
    "ParameterValue": "lji"
  },
  {
    "ParameterKey": "OrchestratorImageUri",
    "ParameterValue": "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-orchestrator:latest"
  },
  {
    "ParameterKey": "CxrSvcImageUri",
    "ParameterValue": "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-cxr-svc:latest"
  },
  {
    "ParameterKey": "EcgSvcImageUri",
    "ParameterValue": "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-ecg-svc:latest"
  },
  {
    "ParameterKey": "LabSvcImageUri",
    "ParameterValue": "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-lab-svc:latest"
  }
]
EOF

echo "✅ Parameters file updated!"
cat compute-stack-params.json
```

---

### **Step 7: 컴퓨팅 스택 배포** (이정인)

```bash
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

echo "✅ Compute stack deployed!"
```

---

### **Step 8: ALB DNS 확인 및 헬스체크**

```bash
# ALB DNS 가져오기
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text \
  --region us-east-1)

echo "=========================================="
echo "ALB DNS: $ALB_DNS"
echo "=========================================="
echo ""

# 서비스가 healthy 상태가 될 때까지 대기 (2-3분)
echo "Waiting for services to become healthy..."
sleep 180

# 헬스체크 테스트
echo "Testing health endpoints..."
echo ""

echo "1. Orchestrator:"
curl -s http://$ALB_DNS/orchestrator/health | jq .
echo ""

echo "2. CXR Service:"
curl -s http://$ALB_DNS/cxr/healthz | jq .
echo ""

echo "3. ECG Service:"
curl -s http://$ALB_DNS/ecg/health | jq .
echo ""

echo "4. Lab Service:"
curl -s http://$ALB_DNS/lab/health | jq .
echo ""

echo "✅ All services are healthy!"
```

---

### **Step 9: ECS 서비스 상태 확인**

```bash
# 실행 중인 태스크 수 확인
echo "Checking ECS services..."
echo ""

for service in orchestrator-service cxr-svc-service ecg-svc-service lab-svc-service; do
  RUNNING=$(aws ecs describe-services \
    --cluster say2-6team-ecs-cluster \
    --services say2-6team-$service \
    --region us-east-1 \
    --query 'services[0].runningCount' \
    --output text)
  
  DESIRED=$(aws ecs describe-services \
    --cluster say2-6team-ecs-cluster \
    --services say2-6team-$service \
    --region us-east-1 \
    --query 'services[0].desiredCount' \
    --output text)
  
  echo "$service: $RUNNING/$DESIRED tasks running"
done

echo ""
echo "✅ ECS services status checked!"
```

---

### **Step 10: CloudWatch Logs 확인**

```bash
# 최근 로그 확인
echo "Checking recent logs..."
echo ""

echo "Orchestrator logs:"
aws logs tail /drai/central-backend --since 5m --region us-east-1 | head -20

echo ""
echo "CXR Service logs:"
aws logs tail /drai/modal/cxr --since 5m --region us-east-1 | head -20

echo ""
echo "✅ Logs are being collected!"
```

---

## 🧪 **시연용 테스트 데이터 준비**

### **Option 1: S3에서 MIMIC 데이터 사용**

```bash
# S3 버킷 확인
aws s3 ls s3://say2-6team-data/ --region us-east-1

# 테스트 케이스 10개 선별 (subject_id 기준)
# 예: 10000032, 10000980, 10001217, 10001725, 10002013, ...
```

### **Option 2: 로컬 테스트 데이터 사용**

```bash
# 프론트엔드에서 직접 파일 업로드
# - ECG: .csv 파일
# - CXR: .jpg/.png 파일
# - Lab: .json 파일
```

---

## 🌐 **프론트엔드 연결**

### **1. 프론트엔드 환경변수 설정**

```bash
cd ../chest-svc-pre/frontend

# .env 파일 생성
cat > .env <<EOF
VITE_API_BASE_URL=http://$ALB_DNS
VITE_WS_URL=ws://$ALB_DNS/ws
EOF
```

### **2. 프론트엔드 실행**

```bash
npm install
npm run dev
```

### **3. 브라우저에서 접속**

```
http://localhost:5173
```

---

## 🎬 **시연 시나리오**

### **시나리오 1: 단일 모달 테스트**

1. 프론트엔드 접속
2. "New Patient" 클릭
3. ECG 파일 업로드
4. 추론 결과 확인 (실시간 WebSocket)
5. 위험도 표시 확인

### **시나리오 2: 멀티모달 통합 테스트**

1. 환자 정보 입력
2. ECG + CXR + Lab 데이터 순차 업로드
3. 각 모달 결과 실시간 확인
4. Bedrock 종합 판단 생성
5. 최종 소견서 확인

### **시나리오 3: CRITICAL 환자 시연**

1. 심각한 이상이 있는 테스트 케이스 선택
2. 데이터 업로드
3. CRITICAL 위험도 표시 확인
4. 긴급 권고사항 확인

---

## 📊 **시연 중 모니터링**

### **실시간 로그 확인**

```bash
# 터미널 1: Orchestrator 로그
aws logs tail /drai/central-backend --follow --region us-east-1

# 터미널 2: CXR 서비스 로그
aws logs tail /drai/modal/cxr --follow --region us-east-1

# 터미널 3: ECG 서비스 로그
aws logs tail /drai/modal/ecg --follow --region us-east-1

# 터미널 4: Lab 서비스 로그
aws logs tail /drai/modal/lab --follow --region us-east-1
```

### **ECS 태스크 모니터링**

```bash
# 실시간 태스크 상태
watch -n 5 'aws ecs list-tasks --cluster say2-6team-ecs-cluster --region us-east-1'
```

---

## 🔧 **트러블슈팅**

### **문제: 헬스체크 실패**

```bash
# Target Group 상태 확인
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names say2-6team-orchestrator-tg \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text \
    --region us-east-1) \
  --region us-east-1
```

### **문제: ECS 태스크 시작 실패**

```bash
# 최근 중지된 태스크 확인
TASK_ARN=$(aws ecs list-tasks \
  --cluster say2-6team-ecs-cluster \
  --desired-status STOPPED \
  --region us-east-1 \
  --query 'taskArns[0]' \
  --output text)

aws ecs describe-tasks \
  --cluster say2-6team-ecs-cluster \
  --tasks $TASK_ARN \
  --region us-east-1 \
  --query 'tasks[0].stoppedReason'
```

### **문제: 서비스 간 통신 실패**

```bash
# Cloud Map 서비스 확인
aws servicediscovery list-services --region us-east-1

# DNS 해석 테스트 (ECS 태스크 내부에서)
aws ecs execute-command \
  --cluster say2-6team-ecs-cluster \
  --task <TASK_ID> \
  --container orchestrator \
  --interactive \
  --command "/bin/bash" \
  --region us-east-1

# 태스크 내부에서
nslookup ecg-svc.say2-6team.local
curl http://ecg-svc.say2-6team.local:8001/health
```

---

## 🗑️ **시연 후 정리 (선택사항)**

```bash
# 역순으로 삭제
aws cloudformation delete-stack --stack-name say2-6team-compute-stack --region us-east-1
aws cloudformation delete-stack --stack-name say2-6team-security-stack --region us-east-1
aws cloudformation delete-stack --stack-name say2-6team-iam-stack --region us-east-1
aws cloudformation delete-stack --stack-name say2-6team-network-stack --region us-east-1

# ECR 이미지 삭제
for repo in orchestrator cxr-svc ecg-svc lab-svc; do
  aws ecr delete-repository \
    --repository-name say2-6team-$repo \
    --force \
    --region us-east-1
done
```

---

## ✅ **체크리스트**

- [ ] 네트워크 스택 배포 완료
- [ ] IAM 스택 배포 완료
- [ ] 보안 스택 배포 완료
- [ ] ECR 리포지토리 생성 완료
- [ ] Docker 이미지 빌드 및 푸시 완료
- [ ] 컴퓨팅 스택 배포 완료
- [ ] ALB 헬스체크 통과
- [ ] ECS 서비스 모두 RUNNING
- [ ] CloudWatch Logs 정상 출력
- [ ] 프론트엔드 연결 성공
- [ ] 테스트 데이터 준비 완료
- [ ] 시연 시나리오 연습 완료

---

## 📞 **담당자**

- **네트워크**: 양정인 (yji)
- **컴퓨팅**: 이정인 (lji)
- **시연 준비**: 전체 팀

---

## 💡 **시연 팁**

1. **사전 준비**: 시연 30분 전에 모든 서비스 헬스체크 확인
2. **백업 계획**: 로컬 환경도 준비 (AWS 장애 대비)
3. **로그 모니터링**: 시연 중 별도 화면에서 로그 확인
4. **테스트 케이스**: 3-5개 정도 미리 테스트해보기
5. **응답 시간**: 첫 요청은 느릴 수 있음 (cold start)

---

## 🎯 **나중에 추가할 것**

1. Aurora DB 스택 (영구 데이터 저장)
2. 모니터링 스택 (CloudWatch Alarms, CloudTrail)
3. HAPI FHIR 서버 (표준 FHIR 리소스 관리)
4. Bedrock Agent 통합 (AI 종합 판단)
5. CloudFront + SSL (프로덕션 배포)
