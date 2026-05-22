# Router Service 추가 변경 사항 요약

## 개요
기존 ECS 클러스터 구성에 router-svc를 추가하여, orchestrator-svc가 다운됐을 때 의사의 직접 action에 의한 각 모달 서비스 호출이 router-svc를 통해 가능하도록 구성했습니다.

## 변경된 파일

### 1. AWS/Security/security-stack.yaml

#### 추가된 리소스

**Security Group:**
- `RouterSecurityGroup` (say2-6team-router-sg)
  - VPC 내부 라우팅 전용 보안 그룹
  - 초기 Egress 규칙 없음 (명시적으로 추가됨)

**Security Group Ingress 규칙:**
- `RouterIngressFromALB`: ALB → Router (TCP 8004)
- `ECGIngressFromRouter`: Router → ECG (TCP 8001)
- `CXRIngressFromRouter`: Router → CXR (TCP 8002)
- `LABIngressFromRouter`: Router → LAB (TCP 8003)
- `RAGIngressFromRouter`: Router → RAG (TCP 8000)

**Security Group Egress 규칙:**
- `ALBEgressToRouter`: ALB → Router (TCP 8004)
- `RouterEgressToECG`: Router → ECG (TCP 8001)
- `RouterEgressToCXR`: Router → CXR (TCP 8002)
- `RouterEgressToLAB`: Router → LAB (TCP 8003)
- `RouterEgressToRAG`: Router → RAG (TCP 8000)
- `RouterEgressToEndpoints`: Router → VPC Endpoints (TCP 443)
- `RouterEgressHTTPSForS3Gateway`: Router → S3 Gateway (TCP 443, 0.0.0.0/0)

**IAM Role:**
- `RouterTaskRole` (say2-6team-router-task-role)
  - Secrets Manager 읽기 권한 (say2-6team/* 한정)
  - KMS Decrypt 및 DescribeKey 권한
  - Bedrock 권한 없음 (stateless 라우팅만 수행)

**Outputs:**
- `RouterSecurityGroupId` → Export: say2-6team-router-sg
- `RouterTaskRoleArn` → Export: say2-6team-router-task-role-arn

**Metadata Notes 업데이트:**
- Router service 역할 설명 추가:
  - "Router service is a stateless routing layer."
  - "When orchestrator is down, router handles direct modal calls from physicians."
  - "Router does not perform judgment or DB write."

---

### 2. AWS/infra/compute-stack.yaml

#### 추가된 리소스

**Parameter:**
- `RouterSvcImageUri`: Router Service ECR 이미지 URI

**CloudWatch Log Group:**
- `RouterLogGroup` (/drai/router, 30일 보관)

**Target Group:**
- `RouterSvcTargetGroup` (say2-6team-router-svc-tg)
  - Port: 8004
  - Protocol: HTTP
  - TargetType: ip
  - HealthCheckPath: /health
  - 기존 서비스와 동일한 헬스체크 설정

**ALB Listener Rule:**
- `RouterSvcListenerRule`
  - Priority: 5 (OrchestratorListenerRule의 priority 10보다 앞)
  - Path Pattern: /route/*
  - Forward to: RouterSvcTargetGroup

**Service Discovery:**
- `RouterSvcServiceDiscovery`
  - Name: router-svc
  - DNS: router-svc.say2-6team.local
  - Type A, TTL 60
  - HealthCheckCustomConfig FailureThreshold 1

**Task Definition:**
- `RouterSvcTaskDefinition` (say2-6team-router-svc-task)
  - Family: say2-6team-router-svc-task
  - NetworkMode: awsvpc
  - RequiresCompatibilities: FARGATE
  - Cpu: 256
  - Memory: 512
  - ExecutionRoleArn: say2-6team-ecs-execution-role-arn (import)
  - TaskRoleArn: say2-6team-router-task-role-arn (import)
  - Container:
    - Name: router-svc
    - Image: RouterSvcImageUri 파라미터 참조
    - Port: 8004
    - 환경변수:
      - ECG_SVC_URL: http://ecg-svc.say2-6team.local:8001
      - CXR_SVC_URL: http://cxr-svc.say2-6team.local:8002
      - LAB_SVC_URL: http://lab-svc.say2-6team.local:8003
      - RAG_SVC_URL: http://rag-svc.say2-6team.local:8000
      - PORT: "8004"
      - LOG_LEVEL: INFO
    - LogConfiguration: awslogs → /drai/router
    - HealthCheck: Python urllib로 localhost:8004/health 호출
    - StartPeriod: 10초

**ECS Service:**
- `RouterSvcService` (say2-6team-router-svc-service)
  - Cluster: ECSCluster 참조
  - TaskDefinition: RouterSvcTaskDefinition 참조
  - DesiredCount: 2 (Multi-AZ 고가용성)
  - LaunchType: FARGATE
  - NetworkConfiguration:
    - AssignPublicIp: DISABLED
    - Subnets: Private App Subnet (AZ-a, AZ-c)
    - SecurityGroups: say2-6team-router-sg (import)
  - LoadBalancers:
    - ContainerName: router-svc
    - ContainerPort: 8004
    - TargetGroupArn: RouterSvcTargetGroup
  - ServiceRegistries:
    - RegistryArn: RouterSvcServiceDiscovery Arn
  - DeploymentConfiguration:
    - MinimumHealthyPercent: 50
    - MaximumPercent: 200
  - DependsOn: HTTPListener
  - Tags: Project, Environment, Owner

---

## 네트워크 아키텍처

### 트래픽 흐름

**정상 시나리오 (Orchestrator 정상):**
```
Client → ALB → Orchestrator → Modal Services (ECG/CXR/LAB/RAG)
                              (Cloud Map DNS 직접 호출)
```

**장애 시나리오 (Orchestrator 다운):**
```
Client → ALB → Router (/route/*) → Modal Services (ECG/CXR/LAB/RAG)
                                   (Cloud Map DNS 직접 호출)
```

### Cloud Map DNS 엔드포인트
- orchestrator: http://orchestrator.say2-6team.local:8000
- router-svc: http://router-svc.say2-6team.local:8004
- ecg-svc: http://ecg-svc.say2-6team.local:8001
- cxr-svc: http://cxr-svc.say2-6team.local:8002
- lab-svc: http://lab-svc.say2-6team.local:8003
- rag-svc: http://rag-svc.say2-6team.local:8000

### ALB 리스너 룰 우선순위
- Priority 5: /route/* → RouterSvcTargetGroup (신규)
- Priority 10: /orchestrator/* → OrchestratorTargetGroup
- Priority 20: /cxr/* → CxrSvcTargetGroup
- Priority 30: /ecg/* → EcgSvcTargetGroup
- Priority 40: /lab/* → LabSvcTargetGroup

---

## Router Service 특징

### 설계 원칙
1. **Stateless**: DB 연결 없음, 세션 없음, 라우팅 로직만 포함
2. **독립성**: Orchestrator와 완전히 독립된 별도 ECS Service
3. **고가용성**: DesiredCount: 2, Multi-AZ 배치로 SPOF 방지
4. **최소 권한**: Bedrock 권한 없음, Secrets Manager 읽기만 가능

### 역할
- Orchestrator가 정상일 때: Orchestrator가 Cloud Map으로 모달 직접 호출
- Orchestrator가 다운됐을 때: Router가 의사 요청을 받아 각 모달로 전달
- Router는 판단(judgment)이나 DB 쓰기를 수행하지 않음

### 리소스 사양
- CPU: 256 (0.25 vCPU)
- Memory: 512 MB
- 이유: 단순 라우팅 로직만 수행하므로 최소 사양

---

## 배포 순서

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
    ParameterKey=OrchestratorImageUri,ParameterValue=<orchestrator-image-uri> \
    ParameterKey=CxrSvcImageUri,ParameterValue=<cxr-image-uri> \
    ParameterKey=EcgSvcImageUri,ParameterValue=<ecg-image-uri> \
    ParameterKey=LabSvcImageUri,ParameterValue=<lab-image-uri> \
    ParameterKey=RouterSvcImageUri,ParameterValue=<router-image-uri> \
  --region ap-northeast-2
```

---

## 검증 체크리스트

### Security Stack 검증
- [ ] RouterSecurityGroup 생성 확인
- [ ] RouterTaskRole 생성 확인
- [ ] Security Group Ingress/Egress 규칙 확인
- [ ] Exports 확인 (say2-6team-router-sg, say2-6team-router-task-role-arn)

### Compute Stack 검증
- [ ] RouterLogGroup 생성 확인 (/drai/router)
- [ ] RouterSvcTargetGroup 생성 확인
- [ ] RouterSvcListenerRule 생성 확인 (Priority 5)
- [ ] RouterSvcServiceDiscovery 생성 확인
- [ ] RouterSvcTaskDefinition 생성 확인
- [ ] RouterSvcService 생성 확인 (DesiredCount: 2)
- [ ] ECS 태스크 Running 상태 확인
- [ ] Cloud Map DNS 등록 확인 (router-svc.say2-6team.local)

### 네트워크 검증
- [ ] ALB → Router 연결 확인 (http://<alb-dns>/route/health)
- [ ] Router → ECG 연결 확인
- [ ] Router → CXR 연결 확인
- [ ] Router → LAB 연결 확인
- [ ] Router → RAG 연결 확인
- [ ] CloudWatch Logs 확인 (/drai/router)

---

## 주의사항

### 기존 리소스 보호
- ✅ 기존 Orchestrator, CXR, ECG, LAB 관련 모든 리소스 수정 없음
- ✅ 기존 Cloud Map 서비스 디스커버리 구성 유지
- ✅ 기존 ALB 리스너 룰 priority 번호 변경 없음
- ✅ 새 리소스의 태그 구조는 기존 리소스와 동일한 패턴 유지

### Router Service 제약
- Router는 Bedrock 호출 불가 (IAM 권한 없음)
- Router는 DB 쓰기 불가 (DB 연결 정보 없음)
- Router는 판단(judgment) 수행 불가
- Router는 단순 라우팅만 수행

---

## 다음 단계

1. **Router Service 애플리케이션 개발**
   - FastAPI 기반 라우팅 로직 구현
   - /health 엔드포인트 구현
   - /route/* 경로 처리 로직 구현
   - Cloud Map DNS를 통한 모달 서비스 호출

2. **ECR 이미지 빌드 및 푸시**
   - Router Service Docker 이미지 빌드
   - ECR에 푸시
   - 이미지 URI 확보

3. **스택 배포**
   - Security Stack 업데이트
   - Compute Stack 업데이트 (RouterSvcImageUri 파라미터 포함)

4. **통합 테스트**
   - Orchestrator 정상 시나리오 테스트
   - Orchestrator 다운 시나리오 테스트
   - Router를 통한 모달 호출 테스트

---

## 문의 및 지원

변경 사항에 대한 문의는 프로젝트 팀에 문의하세요.

- Project: say2-6team
- Owner: lji
- Environment: dev
