# say2-6team 빠른 시작 가이드 (서울 리전)

## ✅ **사전 준비 완료 상태**

- [x] 네트워크 스택 배포 완료 (양정인 - **ap-northeast-2 서울**)
- [ ] IAM 스택 배포
- [ ] 보안 스택 배포
- [ ] ECR 리포지토리 생성
- [ ] Docker 이미지 빌드 & 푸시
- [ ] 컴퓨팅 스택 배포

**⚠️ 중요: 모든 리소스를 서울 리전(ap-northeast-2)에 배포합니다!**

---

## 🚀 **원클릭 배포 (권장)**

```bash
cd infra
bash deploy-demo.sh
```

이 스크립트가 자동으로:
1. ✅ 네트워크 스택 확인 (서울 리전에 이미 있음)
2. 🔄 IAM 스택 배포 (2-3분)
3. 🔄 보안 스택 배포 (2-3분)
4. 🔄 ECR 리포지토리 생성 (1분)

**Region: ap-northeast-2 (서울)**
**총 소요 시간: 약 5-7분**

---

## 📋 **수동 배포 (단계별)**

### **Step 1: IAM 스택 배포**

```bash
cd infra

aws cloudformation create-stack \
  --stack-name say2-6team-iam-stack \
  --template-body file://1-iam-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-2

# 완료 대기
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-iam-stack \
  --region ap-northeast-2

echo "✅ IAM stack deployed!"
```

---

### **Step 2: 보안 스택 배포**

```bash
aws cloudformation create-stack \
  --stack-name say2-6team-security-stack \
  --template-body file://2-security-stack.yaml \
  --region ap-northeast-2

# 완료 대기
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-security-stack \
  --region ap-northeast-2

echo "✅ Security stack deployed!"
```

---

### **Step 3: ECR 리포지토리 생성**

```bash
for repo in orchestrator cxr-svc ecg-svc lab-svc; do
  aws ecr create-repository \
    --repository-name say2-6team-$repo \
    --region ap-northeast-2 \
    --tags Key=Project,Value=say2-6team Key=Owner,Value=lji \
    2>/dev/null || echo "Repository say2-6team-$repo already exists"
done

echo "✅ ECR repositories ready!"
```

---

### **Step 4: Docker 이미지 빌드 & 푸시**

```bash
# build-and-push.sh가 있다면
bash build-and-push.sh

# 없다면 수동으로
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-northeast-2

# ECR 로그인
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# 각 서비스 빌드 & 푸시 (예시: Orchestrator)
cd ../final/central
docker build -t say2-6team-orchestrator .
docker tag say2-6team-orchestrator:latest \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-orchestrator:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-orchestrator:latest

# CXR, ECG, Lab도 동일하게 반복...
```

---

### **Step 5: compute-stack-params.json 생성**

```bash
cd ../../infra

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-northeast-2

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

echo "✅ Parameters file created!"
```

---

### **Step 6: 컴퓨팅 스택 배포**

```bash
aws cloudformation create-stack \
  --stack-name say2-6team-compute-stack \
  --template-body file://compute-stack.yaml \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region ap-northeast-2

# 완료 대기 (10-15분)
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-compute-stack \
  --region ap-northeast-2

echo "✅ Compute stack deployed!"
```

---

### **Step 7: 헬스체크**

```bash
# ALB DNS 가져오기
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text \
  --region ap-northeast-2)

echo "ALB DNS: $ALB_DNS"

# 서비스 준비 대기 (2-3분)
sleep 180

# 헬스체크
curl http://$ALB_DNS/orchestrator/health
curl http://$ALB_DNS/cxr/healthz
curl http://$ALB_DNS/ecg/health
curl http://$ALB_DNS/lab/health
```

---

## 🎬 **시연 준비**

### **프론트엔드 설정**

```bash
cd ../chest-svc-pre/frontend

# 환경변수 설정
cat > .env <<EOF
VITE_API_BASE_URL=http://$ALB_DNS
VITE_WS_URL=ws://$ALB_DNS/ws
EOF

# 프론트엔드 실행
npm install
npm run dev
```

### **브라우저 접속**

```
http://localhost:5173
```

---

## 🧪 **테스트 시나리오**

### **1. 단일 모달 테스트**
- ECG 파일 업로드
- 추론 결과 확인

### **2. 멀티모달 테스트**
- ECG + CXR + Lab 순차 업로드
- 종합 판단 확인

### **3. CRITICAL 환자 시연**
- 심각한 이상 케이스
- 위험도 표시 확인

---

## 🔧 **트러블슈팅**

### **네트워크 스택이 없다고 나오면?**

```bash
# 네트워크 스택 확인
aws cloudformation describe-stacks \
  --stack-name say2-6team-network-stack \
  --region ap-northeast-2

# 없으면 배포 (하지만 이미 있어야 함)
cd AWS/network
aws cloudformation create-stack \
  --stack-name say2-6team-network-stack \
  --template-body file://network-stack.yaml \
  --region ap-northeast-2
```

### **IAM 권한 에러가 나오면?**

```bash
# CAPABILITY_NAMED_IAM 플래그 확인
aws cloudformation create-stack \
  --stack-name say2-6team-iam-stack \
  --template-body file://1-iam-stack.yaml \
  --capabilities CAPABILITY_NAMED_IAM \
  --region ap-northeast-2
```

### **ECR 로그인 실패하면?**

```bash
# AWS CLI 버전 확인
aws --version

# ECR 로그인 재시도
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  $(aws sts get-caller-identity --query Account --output text).dkr.ecr.ap-northeast-2.amazonaws.com
```

---

## 📞 **담당자**

- **네트워크**: 양정인 (yji) - ✅ 완료
- **컴퓨팅**: 이정인 (lji) - 🔄 진행 중
- **시연**: 전체 팀

---

## 💡 **다음 단계**

지금 바로 시작:

```bash
cd infra
bash deploy-demo.sh
```

이 명령어로 IAM + 보안 + ECR이 자동 배포됩니다! 🚀
