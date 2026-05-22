# Region 변경 완료 (us-east-1 → ap-northeast-2)

## ✅ **변경 완료**

모든 인프라 설정을 **서울 리전(ap-northeast-2)**으로 통일했습니다.

---

## 📋 **변경된 파일 목록**

### **1. 배포 스크립트 (3개)**
- ✅ `infra/deploy-demo.sh` - ap-northeast-2
- ✅ `infra/deploy-prerequisites.sh` - ap-northeast-2
- ✅ `infra/deploy-compute.sh` - ap-northeast-2

### **2. 가이드 문서 (1개)**
- ✅ `infra/QUICKSTART.md` - 모든 명령어 ap-northeast-2로 변경

### **3. CloudFormation 템플릿**
- ✅ `infra/1-iam-stack.yaml` - Region 독립적 (수정 불필요)
- ✅ `infra/2-security-stack.yaml` - Region 독립적 (수정 불필요)
- ✅ `infra/compute-stack.yaml` - Region 독립적 (수정 불필요)

---

## 🎯 **현재 상태**

```
Region: ap-northeast-2 (서울)

✅ 네트워크 스택 (양정인 - 이미 배포됨)
⏳ IAM 스택 (이정인 - 지금 배포)
⏳ 보안 스택 (이정인 - 지금 배포)
⏳ ECR 리포지토리 (이정인 - 지금 배포)
⏳ Docker 빌드 & 푸시
⏳ 컴퓨팅 스택 배포
```

---

## 🚀 **지금 바로 시작하기**

```bash
cd infra
bash deploy-demo.sh
```

**이 스크립트가 하는 일:**
1. ✅ 네트워크 스택 확인 (ap-northeast-2에 이미 있음)
2. 🔄 IAM 스택 배포 (ap-northeast-2)
3. 🔄 보안 스택 배포 (ap-northeast-2)
4. 🔄 ECR 리포지토리 생성 (ap-northeast-2)

**총 소요 시간: 약 5-7분**

---

## 📝 **전체 배포 순서**

### **Step 1: 인프라 스택 배포 (자동)**
```bash
cd infra
bash deploy-demo.sh
```

### **Step 2: Docker 이미지 빌드 & 푸시**
```bash
# build-and-push.sh 스크립트 실행
bash build-and-push.sh

# 또는 수동으로
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=ap-northeast-2

# ECR 로그인
aws ecr get-login-password --region $REGION | \
  docker login --username AWS --password-stdin $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com

# 각 서비스 빌드 & 푸시
cd ../final/central
docker build -t say2-6team-orchestrator .
docker tag say2-6team-orchestrator:latest \
  $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-orchestrator:latest
docker push $ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/say2-6team-orchestrator:latest

# CXR, ECG, Lab도 동일하게...
```

### **Step 3: compute-stack-params.json 생성**
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
```

### **Step 4: 컴퓨팅 스택 배포**
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
```

### **Step 5: 헬스체크**
```bash
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text \
  --region ap-northeast-2)

echo "ALB DNS: $ALB_DNS"

# 서비스 준비 대기
sleep 180

# 헬스체크
curl http://$ALB_DNS/orchestrator/health
curl http://$ALB_DNS/cxr/healthz
curl http://$ALB_DNS/ecg/health
curl http://$ALB_DNS/lab/health
```

---

## 🌏 **서울 리전 선택의 장점**

1. **낮은 지연시간** ✅
   - 한국 → 서울: ~10-20ms
   - 한국 → 버지니아: ~200ms

2. **데이터 전송 비용 절감** ✅
   - 같은 리전 내 전송: 무료
   - 리전 간 전송: 유료

3. **응급 의료 시스템에 적합** ✅
   - 실시간 진단 지원
   - 빠른 응답 속도

4. **네트워크 스택 재사용** ✅
   - 이미 배포된 리소스 활용
   - 중복 작업 방지

---

## 🔍 **확인 명령어**

### **모든 스택 확인**
```bash
aws cloudformation list-stacks \
  --region ap-northeast-2 \
  --query 'StackSummaries[?starts_with(StackName, `say2-6team`) && StackStatus!=`DELETE_COMPLETE`].[StackName,StackStatus]' \
  --output table
```

### **네트워크 스택 상세 확인**
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-network-stack \
  --region ap-northeast-2
```

### **Export 확인**
```bash
aws cloudformation list-exports \
  --region ap-northeast-2 \
  --query 'Exports[?starts_with(Name, `say2-6team`)].Name'
```

---

## 📞 **담당자**

- **네트워크**: 양정인 (yji) - ✅ 완료 (ap-northeast-2)
- **컴퓨팅**: 이정인 (lji) - 🔄 진행 중 (ap-northeast-2)
- **시연**: 전체 팀

---

## 💡 **다음 단계**

```bash
cd infra
bash deploy-demo.sh
```

이 명령어로 IAM + 보안 + ECR이 서울 리전에 자동 배포됩니다! 🚀
