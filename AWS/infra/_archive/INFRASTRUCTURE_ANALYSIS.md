# say2-6team 인프라 구성 분석 리포트

## 📊 Executive Summary

**분석 일자**: 2026-05-17  
**분석 대상**: ECS Fargate 기반 멀티모달 AI 진단 시스템  
**분석자**: Kiro AI Assistant

### 주요 발견사항

✅ **잘 구성된 부분 (8개)**
- Multi-AZ 고가용성 설계
- 적절한 리소스 할당
- Cloud Map 서비스 디스커버리
- 보안 그룹 분리
- IAM Role 분리
- CloudWatch Logs 통합
- Health Check 설정
- Rolling Update 전략

⚠️ **개선 완료 (1개)**
- ~~포트 번호 불일치~~ → **수정 완료**

🔄 **추가 권장사항 (5개)**
- WebSocket 지원 추가
- Auto Scaling 정책 구성
- CloudWatch Alarms 설정
- Container Insights 활성화
- X-Ray 분산 추적

---

## 🏗️ 아키텍처 분석

### 1. 네트워크 구성

```
┌─────────────────────────────────────────────────────────────┐
│                    Internet                                  │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
        ┌────────────────────────┐
        │  Route 53 (DNS)        │
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  CloudFront (CDN)      │
        └────────┬───────────────┘
                 │
                 ▼
        ┌────────────────────────┐
        │  ALB (Public Subnet)   │
        │  - AZ-a: 10.0.0.0/24   │
        │  - AZ-c: 10.0.2.0/24   │
        └────────┬───────────────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
┌──────────────┐  ┌──────────────┐
│ Private App  │  │ Private App  │
│ Subnet A     │  │ Subnet C     │
│ 10.0.11.0/24 │  │ 10.0.12.0/24 │
└──────┬───────┘  └───────┬──────┘
       │                  │
       └────────┬─────────┘
                │
        ┌───────┴────────┐
        │                │
        ▼                ▼
┌──────────────┐  ┌──────────────┐
│ ECS Tasks    │  │ Cloud Map    │
│ (Fargate)    │  │ DNS          │
└──────────────┘  └──────────────┘
```

**평가**: ✅ **우수**
- Multi-AZ 분산으로 단일 AZ 장애 대응
- Public/Private Subnet 분리로 보안 강화
- Cloud Map으로 동적 서비스 디스커버리

### 2. 컴퓨팅 리소스 할당

| 서비스 | CPU | Memory | 인스턴스 수 | 월 비용 (예상) |
|--------|-----|--------|------------|---------------|
| Orchestrator | 512 (0.5 vCPU) | 1 GB | 2 | ~$30 |
| ECG 모달 | 1024 (1 vCPU) | 2 GB | 1 | ~$30 |
| CXR 모달 | 2048 (2 vCPU) | 8 GB | 1 | ~$120 |
| LAB 모달 | 1024 (1 vCPU) | 2 GB | 1 | ~$30 |
| **합계** | **4.5 vCPU** | **13 GB** | **5 Tasks** | **~$210/월** |

**평가**: ✅ **적절**
- CXR 모달에 충분한 메모리 할당 (UNet+DenseNet 모델 크기 고려)
- Orchestrator는 경량 (ML 모델 없음, 라우팅만)
- ECG/LAB은 중간 수준 (ONNX/Rule Engine)

**개선 제안**:
```yaml
# 프로덕션 환경에서는 각 서비스 2 Task로 증가
OrchestratorService:
  DesiredCount: 2  # ✅ 이미 2개

EcgSvcService:
  DesiredCount: 2  # 현재 1 → 2로 증가 권장

CxrSvcService:
  DesiredCount: 2  # 현재 1 → 2로 증가 권장

LabSvcService:
  DesiredCount: 2  # 현재 1 → 2로 증가 권장
```

### 3. 서비스 디스커버리 (Cloud Map)

```
Namespace: say2-6team.local (Private DNS)

서비스 등록:
- orchestrator.say2-6team.local:8000
- ecg-svc.say2-6team.local:8003
- cxr-svc.say2-6team.local:8002
- lab-svc.say2-6team.local:8000
```

**평가**: ✅ **우수**
- VPC 내부 Private DNS로 보안 강화
- TTL 60초로 빠른 장애 감지
- Health Check Custom Config로 ECS와 통합

**장점**:
1. Task IP 변경 시 자동 업데이트
2. ALB 없이 직접 통신 (지연 시간 감소)
3. 비용 절감 (ALB 대비 거의 무료)

### 4. 로드 밸런싱 전략

#### ALB Listener Rules

| 우선순위 | 경로 패턴 | Target Group | 용도 |
|---------|----------|--------------|------|
| 10 | `/orchestrator/*` | orchestrator-tg | 중앙 API |
| 20 | `/cxr/*` | cxr-svc-tg | CXR 모달 (외부 접근) |
| 30 | `/ecg/*` | ecg-svc-tg | ECG 모달 (외부 접근) |
| 40 | `/lab/*` | lab-svc-tg | LAB 모달 (외부 접근) |
| Default | `/*` | orchestrator-tg | 기본 라우팅 |

**평가**: ⚠️ **개선 필요**

**문제점**:
- 모달 서비스가 ALB에 직접 노출됨
- 보안상 중앙 오케스트레이터만 외부 노출이 바람직

**권장 구조**:
```
외부 → ALB → Orchestrator만 노출
Orchestrator → Cloud Map DNS → 모달 서비스 (내부 통신)
```

**개선 방안**:
```yaml
# ALB Listener Rules를 Orchestrator만 남기고 제거
# 모달 서비스는 Cloud Map DNS로만 접근

HTTPListener:
  DefaultActions:
    - Type: forward
      TargetGroupArn: !Ref OrchestratorTargetGroup

# CXR/ECG/LAB Listener Rules 제거
# (개발/디버깅 목적이라면 유지 가능)
```

---

## 🔧 포트 구성 분석

### 수정 전 (문제 있음)

| 서비스 | README 포트 | 설정된 포트 | 상태 |
|--------|------------|------------|------|
| Orchestrator | 8000 | 8000 | ✅ 일치 |
| CXR | 8002 | 8002 | ✅ 일치 |
| ECG | **8003** | ~~8001~~ | ❌ 불일치 |
| LAB | **8000** | ~~8003~~ | ❌ 불일치 |

### 수정 후 (현재)

| 서비스 | 컨테이너 포트 | Target Group | Cloud Map | 상태 |
|--------|--------------|--------------|-----------|------|
| Orchestrator | 8000 | 8000 | :8000 | ✅ 일치 |
| CXR | 8002 | 8002 | :8002 | ✅ 일치 |
| ECG | **8003** | **8003** | **:8003** | ✅ 수정 완료 |
| LAB | **8000** | **8000** | **:8000** | ✅ 수정 완료 |

**수정 내역**:
1. `compute-stack.yaml`: 8개 위치 수정
2. `task-definitions/ecg-svc-task.json`: 2개 위치 수정
3. `task-definitions/lab-svc-task.json`: 2개 위치 수정
4. `task-definitions/orchestrator-task.json`: 환경변수 URL 수정

---

## 🔐 보안 분석

### IAM Role 구조

```
ECS Execution Role (ECR/CloudWatch 접근)
  └─ say2-6team-ecs-execution-role

Task Roles (서비스별 권한 분리)
  ├─ say2-6team-orchestrator-task-role
  │   └─ Bedrock, S3, Aurora, HAPI 접근
  ├─ say2-6team-ecg-task-role
  │   └─ S3 (ECG 데이터), Secrets Manager
  ├─ say2-6team-cxr-task-role
  │   └─ S3 (CXR 이미지), Secrets Manager
  └─ say2-6team-lab-task-role
      └─ S3 (LAB 데이터), Secrets Manager
```

**평가**: ✅ **우수**
- Least Privilege 원칙 준수
- 서비스별 권한 분리
- Execution Role과 Task Role 분리

### Security Group 구조

```
ALB Security Group (alb-sg)
  Inbound: 80/443 from 0.0.0.0/0
  Outbound: 8000-8003 to central-sg

Central Security Group (central-sg)
  Inbound: 8000-8003 from alb-sg
  Outbound: 5432 to aurora-sg, 8080 to hapi-sg
```

**평가**: ✅ **적절**
- 최소 권한 원칙
- 계층별 분리

---

## 📊 모니터링 및 로깅

### CloudWatch Logs 구성

| 서비스 | Log Group | Retention | 평가 |
|--------|-----------|-----------|------|
| Orchestrator | `/drai/central-backend` | 90일 | ✅ 적절 |
| ECG | `/drai/modal/ecg` | 30일 | ✅ 적절 |
| CXR | `/drai/modal/cxr` | 30일 | ✅ 적절 |
| LAB | `/drai/modal/lab` | 30일 | ✅ 적절 |

**평가**: ✅ **우수**
- 중앙 오케스트레이터는 90일 (감사 추적)
- 모달 서비스는 30일 (비용 절감)

### Health Check 설정

| 서비스 | 경로 | Interval | Timeout | Retries | StartPeriod |
|--------|------|----------|---------|---------|-------------|
| Orchestrator | `/health` | 30s | 5s | 3 | 10s |
| ECG | `/health` | 30s | 5s | 3 | 60s |
| CXR | `/healthz` | 30s | 5s | 3 | 60s |
| LAB | `/health` | 30s | 5s | 3 | 10s |

**평가**: ✅ **적절**
- CXR/ECG는 StartPeriod 60초 (모델 로딩 시간 고려)
- Orchestrator/LAB은 10초 (빠른 시작)

---

## 🚀 배포 전략

### Rolling Update 설정

```yaml
DeploymentConfiguration:
  MinimumHealthyPercent: 50
  MaximumPercent: 200
```

**의미**:
- 기존 Task 2개 → 새 Task 2개 추가 (총 4개)
- 새 Task Health Check 통과 후 기존 Task 종료
- **다운타임 0**

**평가**: ✅ **우수**

### 개선 제안: Blue/Green 배포

프로덕션 환경에서는 CodeDeploy Blue/Green 배포 권장:

```yaml
DeploymentController:
  Type: CODE_DEPLOY

# CodeDeploy AppSpec
version: 0.0
Resources:
  - TargetService:
      Type: AWS::ECS::Service
      Properties:
        TaskDefinition: <TASK_DEFINITION>
        LoadBalancerInfo:
          ContainerName: orchestrator
          ContainerPort: 8000
Hooks:
  - BeforeInstall: "LambdaFunctionToValidateBeforeInstall"
  - AfterInstall: "LambdaFunctionToValidateAfterInstall"
  - BeforeAllowTraffic: "LambdaFunctionToValidateBeforeTrafficShift"
  - AfterAllowTraffic: "LambdaFunctionToValidateAfterTrafficShift"
```

---

## 💰 비용 분석

### 현재 구성 (DesiredCount 기준)

| 항목 | 수량 | 월 비용 (예상) |
|------|------|---------------|
| **ECS Fargate** | | |
| - Orchestrator (0.5 vCPU, 1GB) × 2 | 2 Tasks | $30 |
| - ECG (1 vCPU, 2GB) × 1 | 1 Task | $30 |
| - CXR (2 vCPU, 8GB) × 1 | 1 Task | $120 |
| - LAB (1 vCPU, 2GB) × 1 | 1 Task | $30 |
| **ALB** | 1 | $25 |
| **Cloud Map** | 4 services | $2 |
| **CloudWatch Logs** | 4 groups | $5 |
| **Data Transfer** | 예상 | $10 |
| **합계** | | **~$252/월** |

### 프로덕션 구성 (각 서비스 2 Task)

| 항목 | 수량 | 월 비용 (예상) |
|------|------|---------------|
| **ECS Fargate** | | |
| - Orchestrator × 2 | 2 Tasks | $30 |
| - ECG × 2 | 2 Tasks | $60 |
| - CXR × 2 | 2 Tasks | $240 |
| - LAB × 2 | 2 Tasks | $60 |
| **ALB** | 1 | $25 |
| **Cloud Map** | 4 services | $2 |
| **CloudWatch Logs** | 4 groups | $10 |
| **Data Transfer** | 예상 | $20 |
| **합계** | | **~$447/월** |

### 비용 절감 방안

1. **Fargate Spot 사용** (최대 70% 절감)
   ```yaml
   CapacityProviderStrategy:
     - CapacityProvider: FARGATE_SPOT
       Weight: 2
     - CapacityProvider: FARGATE
       Weight: 1
   ```

2. **Compute Savings Plans** (1년 약정 시 20% 절감)

3. **CXR 모델 경량화** (8GB → 4GB 가능 시 50% 절감)

---

## 🔌 WebSocket 구성 가이드

### 1. ALB 설정

```bash
# Sticky Session 활성화 (WebSocket 필수)
aws elbv2 modify-target-group-attributes \
  --target-group-arn <ORCHESTRATOR_TG_ARN> \
  --attributes \
    Key=stickiness.enabled,Value=true \
    Key=stickiness.type,Value=lb_cookie \
    Key=stickiness.lb_cookie.duration_seconds,Value=86400

# Idle Timeout 증가 (기본 60초 → 300초)
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn <ALB_ARN> \
  --attributes Key=idle_timeout.timeout_seconds,Value=300
```

### 2. Orchestrator 코드 추가

`final/central/backend/app/main.py`:

```python
from fastapi import WebSocket, WebSocketDisconnect
from typing import Dict, Set

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, patient_id: str):
        await websocket.accept()
        if patient_id not in self.active_connections:
            self.active_connections[patient_id] = set()
        self.active_connections[patient_id].add(websocket)
    
    def disconnect(self, websocket: WebSocket, patient_id: str):
        if patient_id in self.active_connections:
            self.active_connections[patient_id].discard(websocket)
    
    async def broadcast(self, message: dict, patient_id: str):
        if patient_id in self.active_connections:
            for conn in self.active_connections[patient_id]:
                try:
                    await conn.send_json(message)
                except:
                    pass

manager = ConnectionManager()

@app.websocket("/ws/{patient_id}")
async def websocket_endpoint(websocket: WebSocket, patient_id: str):
    await manager.connect(websocket, patient_id)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(websocket, patient_id)
```

### 3. 프론트엔드 연동

```typescript
const ws = new WebSocket(`ws://${ALB_DNS}/ws/${patientId}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'modal_progress') {
    updateProgress(data.modal, data.status);
  }
};
```

---

## ✅ 배포 체크리스트

### Phase 1: 사전 준비
- [ ] 네트워크 스택 배포 완료 (`say2-6team-network-stack`)
- [ ] Security Group 생성 완료
- [ ] IAM Role 생성 완료
- [ ] Cloud Map Namespace 생성 완료
- [ ] ECR 레포지토리 생성 완료

### Phase 2: 이미지 빌드
- [ ] Orchestrator 이미지 빌드 및 ECR 푸시
- [ ] ECG 모달 이미지 빌드 및 ECR 푸시
- [ ] CXR 모달 이미지 빌드 및 ECR 푸시
- [ ] LAB 모달 이미지 빌드 및 ECR 푸시

### Phase 3: 스택 배포
- [ ] `compute-stack-params.json` 이미지 URI 업데이트
- [ ] CloudFormation 스택 생성
- [ ] 스택 생성 완료 대기 (약 10-15분)
- [ ] Output 값 확인 (ALB DNS)

### Phase 4: 서비스 확인
- [ ] ECS 클러스터 생성 확인
- [ ] 4개 서비스 모두 RUNNING 상태
- [ ] Target Group Health Check 통과
- [ ] Cloud Map DNS 등록 확인

### Phase 5: 기능 테스트
- [ ] ALB Health Check 테스트
- [ ] 내부 통신 테스트 (Cloud Map DNS)
- [ ] End-to-End API 테스트
- [ ] WebSocket 연결 테스트

### Phase 6: 모니터링 설정
- [ ] CloudWatch Logs 확인
- [ ] CloudWatch Alarms 설정
- [ ] Container Insights 활성화 (선택)
- [ ] X-Ray 추적 활성화 (선택)

---

## 🎯 권장 개선사항

### 우선순위 1: 즉시 적용

1. **포트 번호 수정** ✅ **완료**
   - ECG: 8001 → 8003
   - LAB: 8003 → 8000

2. **WebSocket 지원 추가**
   - ALB Sticky Session 설정
   - Orchestrator WebSocket 엔드포인트 구현
   - 프론트엔드 WebSocket 클라이언트 구현

3. **프로덕션 Task 수 증가**
   ```yaml
   EcgSvcService:
     DesiredCount: 2  # 1 → 2
   
   CxrSvcService:
     DesiredCount: 2  # 1 → 2
   
   LabSvcService:
     DesiredCount: 2  # 1 → 2
   ```

### 우선순위 2: 단기 (1-2주)

4. **Auto Scaling 정책 추가**
   ```yaml
   ScalableTarget:
     Type: AWS::ApplicationAutoScaling::ScalableTarget
     Properties:
       MaxCapacity: 4
       MinCapacity: 2
       ResourceId: !Sub service/${ECSCluster}/${ServiceName}
       ScalableDimension: ecs:service:DesiredCount
       ServiceNamespace: ecs
   
   ScalingPolicy:
     Type: AWS::ApplicationAutoScaling::ScalingPolicy
     Properties:
       PolicyType: TargetTrackingScaling
       TargetTrackingScalingPolicyConfiguration:
         TargetValue: 70.0
         PredefinedMetricSpecification:
           PredefinedMetricType: ECSServiceAverageCPUUtilization
   ```

5. **CloudWatch Alarms 설정**
   - CPU > 80%
   - Memory > 80%
   - Target Unhealthy Count > 0
   - 4xx/5xx Error Rate > 5%

### 우선순위 3: 중기 (1개월)

6. **Container Insights 활성화**
   ```bash
   aws ecs update-cluster-settings \
     --cluster say2-6team-ecs-cluster \
     --settings name=containerInsights,value=enabled
   ```

7. **X-Ray 분산 추적**
   ```yaml
   ContainerDefinitions:
     - Name: xray-daemon
       Image: amazon/aws-xray-daemon
       Cpu: 32
       Memory: 256
       PortMappings:
         - ContainerPort: 2000
           Protocol: udp
   ```

8. **Blue/Green 배포 전환**
   - CodeDeploy 설정
   - Lambda 검증 함수 작성
   - 자동 롤백 정책 구성

---

## 📈 성능 예측

### 예상 처리량 (Task 2개 기준)

| 서비스 | 추론 시간 | 동시 처리 | 시간당 처리량 |
|--------|----------|----------|--------------|
| ECG | ~500ms | 4 req/s | ~14,400 req/h |
| CXR | ~300ms | 6 req/s | ~21,600 req/h |
| LAB | ~10ms | 200 req/s | ~720,000 req/h |
| Orchestrator | ~50ms | 40 req/s | ~144,000 req/h |

**병목 지점**: ECG 모달 (가장 느림)

**개선 방안**:
- ECG Task 수 증가 (2 → 4)
- ONNX 모델 최적화
- GPU 인스턴스 고려 (Fargate는 GPU 미지원 → EC2 전환 필요)

---

## 🔒 보안 권장사항

### 1. Secrets Manager 사용

```yaml
Environment:
  - Name: DB_PASSWORD
    ValueFrom: arn:aws:secretsmanager:us-east-1:666803869796:secret:say2-6team-db-password
```

### 2. VPC Endpoints 추가

```yaml
# ECR VPC Endpoint (NAT Gateway 비용 절감)
EcrApiEndpoint:
  Type: AWS::EC2::VPCEndpoint
  Properties:
    VpcEndpointType: Interface
    ServiceName: !Sub com.amazonaws.${AWS::Region}.ecr.api
    VpcId: !ImportValue say2-6team-vpc-id
    SubnetIds:
      - !ImportValue say2-6team-private-app-subnet-a
      - !ImportValue say2-6team-private-app-subnet-c
```

### 3. WAF 연동

```yaml
WebACLAssociation:
  Type: AWS::WAFv2::WebACLAssociation
  Properties:
    ResourceArn: !Ref ApplicationLoadBalancer
    WebACLArn: !ImportValue say2-6team-waf-acl-arn
```

---

## 📝 결론

### 현재 상태: **B+ (양호)**

**강점**:
- ✅ Multi-AZ 고가용성 설계
- ✅ 적절한 리소스 할당
- ✅ 보안 그룹 및 IAM 분리
- ✅ Cloud Map 서비스 디스커버리
- ✅ 포트 번호 수정 완료

**개선 필요**:
- ⚠️ WebSocket 지원 추가
- ⚠️ Auto Scaling 정책 구성
- ⚠️ CloudWatch Alarms 설정
- ⚠️ 프로덕션 Task 수 증가

### 다음 단계

1. **즉시**: WebSocket 구현 및 테스트
2. **1주일**: Auto Scaling + CloudWatch Alarms
3. **2주일**: Container Insights + X-Ray
4. **1개월**: Blue/Green 배포 전환

---

**작성일**: 2026-05-17  
**버전**: v1.0  
**분석자**: Kiro AI Assistant  
**검토자**: 이정인 (lji)
