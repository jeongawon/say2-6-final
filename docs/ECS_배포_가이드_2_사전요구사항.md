# ECS 배포 가이드 (2/5) - 사전 요구사항 배포

> **이 단계의 목표**: ECR 저장소 생성 및 필수 인프라 확인

---

## 📚 목차

1. [개요 및 사전 준비](./ECS_배포_가이드_1_개요.md)
2. **[현재 문서] 사전 요구사항 배포**
3. [Docker 이미지 빌드 및 푸시](./ECS_배포_가이드_3_이미지빌드.md)
4. [ECS 컴퓨팅 스택 배포](./ECS_배포_가이드_4_컴퓨팅배포.md)
5. [배포 후 확인 및 트러블슈팅](./ECS_배포_가이드_5_확인및문제해결.md)

---

## 1. 이 단계에서 하는 일

`deploy-prerequisites.sh` 스크립트는 다음 작업을 수행합니다:

```
1. Network Stack 확인
   └─ VPC, Subnet, Route Table 등이 배포되어 있는지 확인

2. Security Stack 확인
   └─ IAM Role, Security Group, KMS 등이 배포되어 있는지 확인

3. ECR Repository 4개 생성
   ├─ say2-6team-orchestrator
   ├─ say2-6team-cxr-svc
   ├─ say2-6team-ecg-svc
   └─ say2-6team-lab-svc
```

**소요 시간**: 약 2-3분

---

## 2. 스크립트 내용 이해하기

### 2.1 전체 스크립트 구조

```bash
#!/bin/bash
# deploy-prerequisites.sh

# 1. 기본 설정
REGION="ap-northeast-2"
PROJECT_NAME="say2-6team"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

# 2. Network Stack 확인
# 3. Security Stack 확인
# 4. ECR Repository 생성
```

### 2.2 각 단계 상세 설명

#### Step 1: Network Stack 확인

```bash
NETWORK_STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-network \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")
```

**무엇을 하나요?**
- CloudFormation에서 `say2-6team-network` 스택의 상태를 확인합니다
- 이 스택은 **양정인**이 배포한 VPC, Subnet 등의 네트워크 인프라입니다

**왜 필요한가요?**
- ECS 컨테이너는 VPC 내부의 Subnet에서 실행됩니다
- Network Stack이 없으면 컨테이너를 배치할 곳이 없습니다

**정상 상태**:
- `CREATE_COMPLETE` 또는 `UPDATE_COMPLETE`

**에러 발생 시**:
```
❌ Network stack not found or not complete!
   Status: NOT_FOUND
   Network stack should be deployed by 양정인
```
→ 양정인에게 Network Stack 배포를 요청하세요

#### Step 2: Security Stack 확인

```bash
SECURITY_STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-security \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")
```

**무엇을 하나요?**
- CloudFormation에서 `say2-6team-security` 스택의 상태를 확인합니다
- 이 스택은 **보안팀**이 배포한 IAM Role, Security Group, KMS 등입니다

**왜 필요한가요?**
- ECS Task는 IAM Role을 사용해 AWS 리소스에 접근합니다
  - Orchestrator → Aurora DB 접근
  - Orchestrator → Bedrock (AI) 접근
  - 모든 Task → CloudWatch Logs 쓰기
- Security Group으로 네트워크 트래픽을 제어합니다

**정상 상태**:
- `CREATE_COMPLETE` 또는 `UPDATE_COMPLETE`

**에러 발생 시**:
```
❌ Security stack not found or not complete!
   Status: NOT_FOUND
   Security stack (say2-6team-security) should be deployed by security team
```
→ 보안팀에게 Security Stack 배포를 요청하세요

#### Step 3: ECR Repository 생성

```bash
REPOS=("orchestrator" "cxr-svc" "ecg-svc" "lab-svc")

for REPO in "${REPOS[@]}"; do
    REPO_NAME="${PROJECT_NAME}-${REPO}"
    
    # Repository 존재 확인
    if aws ecr describe-repositories \
        --repository-names ${REPO_NAME} \
        --region ${REGION} >/dev/null 2>&1; then
        echo "  ✅ ${REPO_NAME} already exists"
    else
        echo "  Creating ${REPO_NAME}..."
        aws ecr create-repository \
          --repository-name ${REPO_NAME} \
          --region ${REGION} \
          --image-scanning-configuration scanOnPush=true \
          --encryption-configuration encryptionType=AES256 \
          --tags Key=Project,Value=${PROJECT_NAME} Key=Owner,Value=lji
        echo "  ✅ ${REPO_NAME} created"
    fi
done
```

**무엇을 하나요?**
- 4개의 ECR Repository를 생성합니다
- 이미 존재하면 건너뜁니다 (멱등성)

**ECR Repository 설정**:
- `scanOnPush=true`: 이미지 푸시 시 보안 취약점 자동 스캔
- `encryptionType=AES256`: 저장 시 암호화

**생성되는 Repository**:
1. `say2-6team-orchestrator` - 중앙 조정 서비스
2. `say2-6team-cxr-svc` - 흉부 X-ray 분석 서비스
3. `say2-6team-ecg-svc` - 심전도 분석 서비스
4. `say2-6team-lab-svc` - 혈액검사 분석 서비스

---

## 3. 실행 방법

### 3.1 터미널 열기

**Windows (Git Bash)**:
1. 프로젝트 폴더에서 우클릭
2. "Git Bash Here" 선택

**Windows (WSL)**:
```bash
cd /mnt/c/Users/0627j/say2_final/say2-6-final
```

**Mac/Linux**:
```bash
cd ~/say2_final/say2-6-final
```

### 3.2 infra 디렉토리로 이동

```bash
cd infra
```

### 3.3 스크립트 실행 권한 부여

```bash
chmod +x deploy-prerequisites.sh
```

### 3.4 스크립트 실행

```bash
bash deploy-prerequisites.sh
```

---

## 4. 실행 결과 예시

### 4.1 정상 실행 시

```
==========================================
say2-6team Prerequisites Deployment
Region: ap-northeast-2
Account: 666803869796
==========================================

[1/3] Checking Network Stack...
✅ Network stack already deployed

[2/3] Checking Security Stack...
✅ Security stack already deployed (보안팀 제공)
   Stack includes: KMS, Security Groups, IAM Roles, Cognito, WAF

[3/3] Creating ECR Repositories...
  Creating say2-6team-orchestrator...
  ✅ say2-6team-orchestrator created
  Creating say2-6team-cxr-svc...
  ✅ say2-6team-cxr-svc created
  Creating say2-6team-ecg-svc...
  ✅ say2-6team-ecg-svc created
  Creating say2-6team-lab-svc...
  ✅ say2-6team-lab-svc created

==========================================
✅ Prerequisites deployment complete!
==========================================

Next steps:
  1. Build and push Docker images:
     bash build-and-push.sh

  2. Deploy compute stack:
     bash deploy-compute.sh
```

### 4.2 이미 실행한 경우 (재실행)

```
==========================================
say2-6team Prerequisites Deployment
Region: ap-northeast-2
Account: 666803869796
==========================================

[1/3] Checking Network Stack...
✅ Network stack already deployed

[2/3] Checking Security Stack...
✅ Security stack already deployed (보안팀 제공)

[3/3] Creating ECR Repositories...
  ✅ say2-6team-orchestrator already exists
  ✅ say2-6team-cxr-svc already exists
  ✅ say2-6team-ecg-svc already exists
  ✅ say2-6team-lab-svc already exists

==========================================
✅ Prerequisites deployment complete!
==========================================
```

→ 이미 생성된 리소스는 건너뛰므로 안전하게 재실행 가능합니다.

---

## 5. 에러 상황 및 해결 방법

### 에러 1: Network Stack이 없는 경우

```
❌ Error: Network stack not found or not complete!
   Status: NOT_FOUND
   Network stack should be deployed by 양정인
```

**원인**: Network Stack이 배포되지 않았습니다.

**해결 방법**:
1. 양정인에게 연락하여 Network Stack 배포 요청
2. 또는 직접 배포:
   ```bash
   cd ../AWS/network
   aws cloudformation create-stack \
     --stack-name say2-6team-network \
     --template-body file://network-stack.yaml \
     --region ap-northeast-2
   ```

### 에러 2: Security Stack이 없는 경우

```
❌ Error: Security stack not found or not complete!
   Status: NOT_FOUND
   Security stack (say2-6team-security) should be deployed by security team
```

**원인**: Security Stack이 배포되지 않았습니다.

**해결 방법**:
1. 보안팀에게 연락하여 Security Stack 배포 요청
2. 또는 직접 배포:
   ```bash
   cd ../AWS
   aws cloudformation create-stack \
     --stack-name say2-6team-security \
     --template-body file://security-stack.yaml \
     --capabilities CAPABILITY_IAM \
     --region ap-northeast-2
   ```

### 에러 3: AWS 자격 증명 오류

```
Unable to locate credentials. You can configure credentials by running "aws configure".
```

**원인**: AWS CLI 자격 증명이 설정되지 않았습니다.

**해결 방법**:
```bash
aws configure
# AWS Access Key ID, Secret Access Key 입력
# Region: ap-northeast-2
# Output format: json
```

### 에러 4: ECR Repository 생성 권한 없음

```
An error occurred (AccessDeniedException) when calling the CreateRepository operation
```

**원인**: IAM 사용자에게 ECR 생성 권한이 없습니다.

**해결 방법**:
1. 팀 리더에게 연락하여 ECR 권한 요청
2. 필요한 IAM 정책: `AmazonEC2ContainerRegistryFullAccess`

---

## 6. 확인 방법

### 6.1 AWS Console에서 확인

1. AWS Console 로그인 (https://console.aws.amazon.com)
2. 리전을 **서울 (ap-northeast-2)** 로 변경
3. **ECR** 서비스로 이동
4. 다음 4개 Repository가 보여야 합니다:
   - `say2-6team-orchestrator`
   - `say2-6team-cxr-svc`
   - `say2-6team-ecg-svc`
   - `say2-6team-lab-svc`

### 6.2 CLI로 확인

```bash
# ECR Repository 목록 확인
aws ecr describe-repositories \
  --region ap-northeast-2 \
  --query 'repositories[?starts_with(repositoryName, `say2-6team`)].repositoryName' \
  --output table

# 출력 예시:
# -----------------------------------
# |     DescribeRepositories        |
# +---------------------------------+
# |  say2-6team-orchestrator        |
# |  say2-6team-cxr-svc             |
# |  say2-6team-ecg-svc             |
# |  say2-6team-lab-svc             |
# +---------------------------------+
```

### 6.3 CloudFormation Stack 상태 확인

```bash
# Network Stack 상태 확인
aws cloudformation describe-stacks \
  --stack-name say2-6team-network \
  --region ap-northeast-2 \
  --query 'Stacks[0].StackStatus' \
  --output text

# 출력: CREATE_COMPLETE 또는 UPDATE_COMPLETE

# Security Stack 상태 확인
aws cloudformation describe-stacks \
  --stack-name say2-6team-security \
  --region ap-northeast-2 \
  --query 'Stacks[0].StackStatus' \
  --output text

# 출력: CREATE_COMPLETE 또는 UPDATE_COMPLETE
```

---

## 7. 다음 단계

사전 요구사항 배포가 완료되었습니다! 이제 Docker 이미지를 빌드하고 ECR에 푸시할 차례입니다.

👉 **[3. Docker 이미지 빌드 및 푸시](./ECS_배포_가이드_3_이미지빌드.md)**

---

## 8. 체크리스트

이 단계를 완료했다면 다음 항목들을 확인하세요:

- [ ] `deploy-prerequisites.sh` 스크립트 실행 완료
- [ ] Network Stack 상태: `CREATE_COMPLETE` 또는 `UPDATE_COMPLETE`
- [ ] Security Stack 상태: `CREATE_COMPLETE` 또는 `UPDATE_COMPLETE`
- [ ] ECR Repository 4개 생성 확인
  - [ ] say2-6team-orchestrator
  - [ ] say2-6team-cxr-svc
  - [ ] say2-6team-ecg-svc
  - [ ] say2-6team-lab-svc
- [ ] AWS Console 또는 CLI로 확인 완료

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)
