# ECS 배포 가이드 (4/5) - ECS 컴퓨팅 스택 배포

> **이 단계의 목표**: ECS Cluster, ALB, Service 등 컴퓨팅 인프라 배포

---

## 📚 목차

1. [개요 및 사전 준비](./ECS_배포_가이드_1_개요.md)
2. [사전 요구사항 배포](./ECS_배포_가이드_2_사전요구사항.md)
3. [Docker 이미지 빌드 및 푸시](./ECS_배포_가이드_3_이미지빌드.md)
4. **[현재 문서] ECS 컴퓨팅 스택 배포**
5. [배포 후 확인 및 트러블슈팅](./ECS_배포_가이드_5_확인및문제해결.md)

---

## 1. 이 단계에서 하는 일

`deploy-compute.sh` 스크립트는 CloudFormation을 사용하여 다음 리소스들을 생성합니다:

```
1. 사전 요구사항 확인
   ├─ Network Stack 확인
   ├─ Security Stack 확인
   ├─ Aurora Stack 확인
   └─ ECR Repository 확인

2. CloudFormation Stack 배포 (compute-stack.yaml)
   ├─ ECS Cluster 생성
   ├─ CloudWatch Log Groups 생성 (4개)
   ├─ Application Load Balancer (ALB) 생성
   ├─ Target Groups 생성 (4개)
   ├─ ALB Listener 및 Routing Rules 설정
   ├─ Service Discovery 설정 (Cloud Map)
   ├─ ECS Task Definitions 생성 (4개)
   └─ ECS Services 생성 (4개, 각 2 Tasks)

3. 배포 완료 후 ALB DNS 출력
```

**소요 시간**: 약 10-15분

---

## 2. CloudFormation Stack 구조 이해하기

### 2.1 생성되는 리소스 전체 맵

```
say2-6team-compute Stack
│
├─ ECS Cluster
│  └─ say2-6team-ecs-cluster
│
├─ CloudWatch Log Groups (4개)
│  ├─ /drai/central-backend (Orchestrator)
│  ├─ /drai/modal/cxr (CXR Service)
│  ├─ /drai/modal/ecg (ECG Service)
│  └─ /drai/modal/lab (Lab Service)
│
├─ Application Load Balancer
│  ├─ say2-6team-alb
│  ├─ HTTP Listener (Port 80)
│  └─ Routing Rules
│     ├─ /orchestrator/* → Orchestrator Target Group
│     ├─ /cxr/* → CXR Target Group
│     ├─ /ecg/* → ECG Target Group
│     └─ /lab/* → Lab Target Group
│
├─ Target Groups (4개)
│  ├─ say2-6team-orchestrator-tg (Port 8000)
│  ├─ say2-6team-cxr-svc-tg (Port 8002)
│  ├─ say2-6team-ecg-svc-tg (Port 8001)
│  └─ say2-6team-lab-svc-tg (Port 8003)
│
├─ Service Discovery (Cloud Map)
│  ├─ orchestrator.say2-6team.local
│  ├─ cxr-svc.say2-6team.local
│  ├─ ecg-svc.say2-6team.local
│  └─ lab-svc.say2-6team.local
│
├─ Task Definitions (4개)
│  ├─ say2-6team-orchestrator-task (0.5 vCPU, 1GB)
│  ├─ say2-6team-cxr-svc-task (2 vCPU, 8GB)
│  ├─ say2-6team-ecg-svc-task (1 vCPU, 2GB)
│  └─ say2-6team-lab-svc-task (1 vCPU, 2GB)
│
└─ ECS Services (4개, 각 2 Tasks)
   ├─ say2-6team-orchestrator-service
   │  ├─ Task 1 (AZ-a)
   │  └─ Task 2 (AZ-c)
   ├─ say2-6team-cxr-svc-service
   │  ├─ Task 1 (AZ-a)
   │  └─ Task 2 (AZ-c)
   ├─ say2-6team-ecg-svc-service
   │  ├─ Task 1 (AZ-a)
   │  └─ Task 2 (AZ-c)
   └─ say2-6team-lab-svc-service
      ├─ Task 1 (AZ-a)
      └─ Task 2 (AZ-c)
```

### 2.2 주요 리소스 설명

#### ECS Cluster
- **역할**: 모든 ECS Task를 실행하는 논리적 그룹
- **Capacity Provider**: Fargate (서버리스)
- **이름**: `say2-6team-ecs-cluster`

#### Application Load Balancer (ALB)
- **역할**: 외부 트래픽을 받아서 적절한 서비스로 라우팅
- **타입**: Internet-facing (공개)
- **리스너**: HTTP Port 80
- **라우팅**: 경로 기반 (`/orchestrator/*`, `/cxr/*` 등)

#### Target Group
- **역할**: ALB가 트래픽을 보낼 대상 그룹
- **타입**: IP (Fargate는 IP 타입 필수)
- **Health Check**: 각 서비스의 health 엔드포인트 확인

#### Service Discovery (Cloud Map)
- **역할**: 서비스 간 내부 통신을 위한 DNS
- **Namespace**: `say2-6team.local`
- **예시**: Orchestrator가 `cxr-svc.say2-6team.local:8002`로 CXR 호출

#### Task Definition
- **역할**: 컨테이너를 어떻게 실행할지 정의
- **포함 내용**: 이미지 URI, CPU/메모리, 환경 변수, IAM Role

#### ECS Service
- **역할**: Task를 지정된 개수만큼 실행하고 관리
- **Desired Count**: 2 (각 서비스마다)
- **배포 전략**: Rolling Update

---

## 3. 스크립트 내용 상세 분석

### 3.1 사전 요구사항 확인

```bash
# Network Stack 확인
NETWORK_STACK_STATUS=$(aws cloudformation describe-stacks \
  --stack-name ${PROJECT_NAME}-network \
  --region ${REGION} \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || echo "NOT_FOUND")

if [ "$NETWORK_STACK_STATUS" != "CREATE_COMPLETE" ] && \
   [ "$NETWORK_STACK_STATUS" != "UPDATE_COMPLETE" ]; then
  echo "❌ Error: Network stack not found or not complete!"
  exit 1
fi
```

**확인하는 Stack**:
1. **Network Stack** (`say2-6team-network`)
   - VPC, Subnet, Route Table 등
   - 양정인 담당

2. **Security Stack** (`say2-6team-security`)
   - IAM Role, Security Group, KMS 등
   - 보안팀 담당

3. **Aurora Stack** (`say2-6team-aurora`)
   - Aurora Serverless v2 DB
   - DB 팀 담당

4. **ECR Repositories** (4개)
   - Docker 이미지 저장소

**모두 배포되어 있어야 다음 단계 진행 가능**

### 3.2 compute-stack-params.json 확인

```bash
if [ ! -f "compute-stack-params.json" ]; then
  echo "❌ Error: compute-stack-params.json not found!"
  exit 1
fi

if grep -q "REPLACE_WITH_ACTUAL_IMAGE_URI" compute-stack-params.json; then
  echo "⚠️  Warning: compute-stack-params.json contains placeholder values!"
  echo "Please update ECR image URIs before deploying."
  exit 1
fi
```

**확인 내용**:
- 파일이 존재하는지
- 플레이스홀더가 아닌 실제 이미지 URI가 있는지

**이 파일은 `build-and-push.sh`에서 자동 생성됨**

### 3.3 CloudFormation Stack 생성

```bash
aws cloudformation create-stack \
  --stack-name ${PROJECT_NAME}-compute \
  --template-body "$(cat compute-stack.yaml)" \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region ${REGION} \
  --tags \
    Key=Project,Value=${PROJECT_NAME} \
    Key=Owner,Value=lji \
    Key=Environment,Value=dev
```

**주요 옵션**:
- `--stack-name`: Stack 이름 (`say2-6team-compute`)
- `--template-body`: CloudFormation 템플릿 (YAML)
- `--parameters`: 파라미터 파일 (이미지 URI 등)
- `--capabilities CAPABILITY_IAM`: IAM 리소스 생성 권한
- `--tags`: 리소스 태그

### 3.4 Stack 생성 대기

```bash
aws cloudformation wait stack-create-complete \
  --stack-name ${PROJECT_NAME}-compute \
  --region ${REGION}
```

**무엇을 하나요?**
- Stack 생성이 완료될 때까지 대기
- 10-15분 소요
- 진행 상황은 AWS Console에서 확인 가능

**생성 순서**:
1. ECS Cluster (1분)
2. CloudWatch Log Groups (1분)
3. ALB 및 Target Groups (3-4분)
4. Service Discovery (1분)
5. Task Definitions (1분)
6. ECS Services (5-8분) ← 가장 오래 걸림

### 3.5 ALB DNS 출력

```bash
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name ${PROJECT_NAME}-compute \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text \
  --region ${REGION})

echo "ALB DNS Name: ${ALB_DNS}"
echo ""
echo "Test endpoints:"
echo "  Orchestrator: http://${ALB_DNS}/orchestrator/health"
echo "  CXR Service:  http://${ALB_DNS}/cxr/healthz"
echo "  ECG Service:  http://${ALB_DNS}/ecg/health"
echo "  Lab Service:  http://${ALB_DNS}/lab/health"
```

**출력 예시**:
```
ALB DNS Name: say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com

Test endpoints:
  Orchestrator: http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/orchestrator/health
  CXR Service:  http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/cxr/healthz
  ECG Service:  http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/ecg/health
  Lab Service:  http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/lab/health
```

---

## 4. 실행 방법

### 4.1 infra 디렉토리로 이동

```bash
cd infra
```

### 4.2 스크립트 실행 권한 부여

```bash
chmod +x deploy-compute.sh
```

### 4.3 스크립트 실행

```bash
bash deploy-compute.sh
```

**⚠️ 주의사항**:
- 이 과정은 **10-15분** 정도 걸립니다
- 중간에 중단하지 마세요
- AWS Console에서 진행 상황을 실시간으로 확인할 수 있습니다

---

## 5. 실행 결과 예시

### 5.1 정상 실행 시

```
==========================================
say2-6team Compute Stack Deployment
Region: ap-northeast-2 (Seoul)
==========================================

Checking prerequisites...
✅ Network stack verified
✅ Security stack verified (KMS, IAM Roles, Security Groups)
✅ Aurora stack verified (Database ready)
✅ ECR repositories verified

✅ All prerequisites are in place!

Checking ECR image URIs in compute-stack-params.json...
✅ Parameters file looks good!

Deploying Compute Stack...
This will take 10-15 minutes...

{
    "StackId": "arn:aws:cloudformation:ap-northeast-2:666803869796:stack/say2-6team-compute/abc12345-..."
}

Waiting for Compute stack to complete...
(This may take 10-15 minutes - ECS services are being created)

✅ Compute Stack deployed successfully!

==========================================
Deployment Complete!
==========================================

ALB DNS Name: say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com

Test endpoints:
  Orchestrator: http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/orchestrator/health
  CXR Service:  http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/cxr/healthz
  ECG Service:  http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/ecg/health
  Lab Service:  http://say2-6team-alb-1234567890.ap-northeast-2.elb.amazonaws.com/lab/health

Next steps:
1. Wait 2-3 minutes for services to become healthy
2. Test health endpoints above
3. Configure frontend with ALB DNS
4. Implement WebSocket support
```

---

## 6. AWS Console에서 진행 상황 확인

### 6.1 CloudFormation 콘솔

1. AWS Console 로그인
2. **CloudFormation** 서비스로 이동
3. 리전: **서울 (ap-northeast-2)**
4. Stack 이름: `say2-6team-compute` 클릭
5. **Events** 탭에서 실시간 진행 상황 확인

**주요 이벤트**:
```
CREATE_IN_PROGRESS  AWS::ECS::Cluster              ECSCluster
CREATE_COMPLETE     AWS::ECS::Cluster              ECSCluster
CREATE_IN_PROGRESS  AWS::ElasticLoadBalancingV2::LoadBalancer  ApplicationLoadBalancer
CREATE_COMPLETE     AWS::ElasticLoadBalancingV2::LoadBalancer  ApplicationLoadBalancer
CREATE_IN_PROGRESS  AWS::ECS::Service              OrchestratorService
CREATE_COMPLETE     AWS::ECS::Service              OrchestratorService
...
CREATE_COMPLETE     AWS::CloudFormation::Stack     say2-6team-compute
```

### 6.2 ECS 콘솔

1. **ECS** 서비스로 이동
2. **Clusters** → `say2-6team-ecs-cluster` 클릭
3. **Services** 탭에서 4개 서비스 확인:
   - `say2-6team-orchestrator-service`
   - `say2-6team-cxr-svc-service`
   - `say2-6team-ecg-svc-service`
   - `say2-6team-lab-svc-service`

4. 각 서비스 클릭 → **Tasks** 탭에서 Task 상태 확인
   - **PROVISIONING**: Task 생성 중
   - **PENDING**: 컨테이너 시작 준비 중
   - **RUNNING**: 컨테이너 실행 중 ✅

### 6.3 EC2 콘솔 (ALB 확인)

1. **EC2** 서비스로 이동
2. 왼쪽 메뉴 → **Load Balancers**
3. `say2-6team-alb` 클릭
4. **Description** 탭에서 DNS 이름 확인
5. **Target Groups** 탭에서 4개 Target Group 확인
6. 각 Target Group의 **Targets** 탭에서 Health 상태 확인
   - **initial**: 초기 Health Check 중
   - **healthy**: 정상 ✅
   - **unhealthy**: 비정상 ❌

---

## 7. 에러 상황 및 해결 방법

### 에러 1: Network Stack이 없는 경우

```
❌ Error: Network stack not found or not complete!
   Status: NOT_FOUND
```

**해결 방법**:
- 양정인에게 Network Stack 배포 요청
- 또는 `AWS/network/network-stack.yaml` 배포

### 에러 2: Security Stack이 없는 경우

```
❌ Error: Security stack not found or not complete!
   Status: NOT_FOUND
```

**해결 방법**:
- 보안팀에게 Security Stack 배포 요청
- 또는 `AWS/security-stack.yaml` 배포

### 에러 3: Aurora Stack이 없는 경우

```
❌ Error: Aurora stack not found or not complete!
   Status: NOT_FOUND
```

**해결 방법**:
```bash
cd infra
bash deploy-aurora.sh
```

### 에러 4: compute-stack-params.json이 없는 경우

```
❌ Error: compute-stack-params.json not found!
```

**해결 방법**:
```bash
# Docker 이미지 빌드 및 푸시 (파라미터 파일 자동 생성)
bash build-and-push.sh
```

### 에러 5: CloudFormation Stack 생성 실패

```
CREATE_FAILED  AWS::ECS::Service  OrchestratorService
Resource handler returned message: "Invalid IAM role"
```

**원인**: IAM Role이 없거나 권한 부족

**해결 방법**:
1. Security Stack이 제대로 배포되었는지 확인
2. IAM Role Export 확인:
   ```bash
   aws cloudformation list-exports \
     --region ap-northeast-2 \
     --query 'Exports[?starts_with(Name, `say2-6team`)].Name'
   ```

### 에러 6: Task가 RUNNING 상태가 되지 않음

**증상**: Task가 계속 PENDING 또는 STOPPED 상태

**원인 1**: 이미지를 ECR에서 가져올 수 없음
```bash
# ECR 이미지 확인
aws ecr describe-images \
  --repository-name say2-6team-orchestrator \
  --region ap-northeast-2
```

**원인 2**: IAM Role 권한 부족
- ECS Execution Role에 ECR 접근 권한 필요
- Security Stack 확인

**원인 3**: Subnet에 인터넷 연결 없음
- Private Subnet은 NAT Gateway 또는 VPC Endpoint 필요
- Network Stack 확인

### 에러 7: Health Check 실패

**증상**: Target Group에서 Target이 unhealthy 상태

**원인**: Health Check 엔드포인트가 응답하지 않음

**해결 방법**:
1. ECS Task 로그 확인:
   ```bash
   # CloudWatch Logs에서 확인
   aws logs tail /drai/central-backend --follow --region ap-northeast-2
   ```

2. Health Check 경로 확인:
   - Orchestrator: `/health`
   - CXR: `/healthz`
   - ECG: `/health`
   - Lab: `/health`

3. 컨테이너가 정상 시작되었는지 확인

---

## 8. 다음 단계

ECS 컴퓨팅 스택 배포가 완료되었습니다! 이제 배포된 서비스를 확인하고 테스트할 차례입니다.

👉 **[5. 배포 후 확인 및 트러블슈팅](./ECS_배포_가이드_5_확인및문제해결.md)**

---

## 9. 체크리스트

이 단계를 완료했다면 다음 항목들을 확인하세요:

- [ ] `deploy-compute.sh` 스크립트 실행 완료
- [ ] CloudFormation Stack 상태: `CREATE_COMPLETE`
- [ ] ECS Cluster 생성 확인
- [ ] ALB 생성 및 DNS 이름 확인
- [ ] 4개 ECS Service 생성 확인
- [ ] 각 Service마다 2개 Task 실행 중 확인
- [ ] Target Group Health Check 상태 확인

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)
