# say2-6team ECS 배포 가이드

## 📋 목차
1. [사전 준비](#사전-준비)
2. [포트 구성](#포트-구성)
3. [배포 순서](#배포-순서)
4. [WebSocket 구성](#websocket-구성)
5. [테스트 및 검증](#테스트-및-검증)
6. [트러블슈팅](#트러블슈팅)

---

## 🔧 사전 준비

### 1. 필수 AWS 리소스 확인

배포 전 다음 리소스들이 생성되어 있어야 합니다:

```bash
# VPC 및 네트워크 스택 확인
aws cloudformation describe-stacks --stack-name say2-6team-network-stack

# 필요한 Export 값 확인
aws cloudformation list-exports | grep say2-6team
```

**필수 Export 값:**
- `say2-6team-vpc-id`
- `say2-6team-public-subnet-a`
- `say2-6team-public-subnet-c`
- `say2-6team-private-app-subnet-a`
- `say2-6team-private-app-subnet-c`
- `say2-6team-alb-sg`
- `say2-6team-central-sg`
- `say2-6team-cloud-map-namespace-id`
- `say2-6team-ecs-execution-role-arn`
- `say2-6team-orchestrator-task-role-arn`
- `say2-6team-ecg-task-role-arn`
- `say2-6team-cxr-task-role-arn`
- `say2-6team-lab-task-role-arn`

### 2. ECR 레포지토리 생성

```bash
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="666803869796"

# ECR 레포지토리 생성
aws ecr create-repository --repository-name say2-6team-orchestrator --region ${AWS_REGION}
aws ecr create-repository --repository-name say2-6team-ecg-svc --region ${AWS_REGION}
aws ecr create-repository --repository-name say2-6team-cxr-svc --region ${AWS_REGION}
aws ecr create-repository --repository-name say2-6team-lab-svc --region ${AWS_REGION}
```

---

## 🔌 포트 구성

### 서비스별 포트 매핑

| 서비스 | 컨테이너 포트 | Target Group 포트 | ALB 경로 | Cloud Map DNS |
|--------|--------------|------------------|----------|---------------|
| **Orchestrator** | 8000 | 8000 | `/orchestrator/*` | `orchestrator.say2-6team.local:8000` |
| **CXR 모달** | 8002 | 8002 | `/cxr/*` | `cxr-svc.say2-6team.local:8002` |
| **ECG 모달** | 8003 | 8003 | `/ecg/*` | `ecg-svc.say2-6team.local:8003` |
| **LAB 모달** | 8000 | 8000 | `/lab/*` | `lab-svc.say2-6team.local:8000` |

### 포트 변경 이력

**⚠️ 중요: 포트 번호가 수정되었습니다!**

- ECG 모달: ~~8001~~ → **8003** (README 기준으로 수정)
- LAB 모달: ~~8003~~ → **8000** (README 기준으로 수정)

---

## 🚀 배포 순서

### Step 1: Docker 이미지 빌드 및 ECR 푸시

```bash
#!/bin/bash
set -e

AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="666803869796"
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

# ECR 로그인
aws ecr get-login-password --region ${AWS_REGION} | \
  docker login --username AWS --password-stdin ${ECR_REGISTRY}

# 1. 중앙 오케스트레이터
echo "Building orchestrator..."
cd final/central/backend
docker build --platform linux/amd64 -t say2-6team-orchestrator:latest .
docker tag say2-6team-orchestrator:latest ${ECR_REGISTRY}/say2-6team-orchestrator:latest
docker push ${ECR_REGISTRY}/say2-6team-orchestrator:latest

# 2. ECG 모달
echo "Building ECG service..."
cd ../../../ecg-svc
docker build --platform linux/amd64 -t say2-6team-ecg-svc:latest .
docker tag say2-6team-ecg-svc:latest ${ECR_REGISTRY}/say2-6team-ecg-svc:latest
docker push ${ECR_REGISTRY}/say2-6team-ecg-svc:latest

# 3. CXR 모달
echo "Building CXR service..."
cd ../chest-svc-pre
docker build --platform linux/amd64 -t say2-6team-cxr-svc:latest .
docker tag say2-6team-cxr-svc:latest ${ECR_REGISTRY}/say2-6team-cxr-svc:latest
docker push ${ECR_REGISTRY}/say2-6team-cxr-svc:latest

# 4. LAB 모달
echo "Building LAB service..."
cd ../Lab-svc
docker build --platform linux/amd64 -t say2-6team-lab-svc:latest .
docker tag say2-6team-lab-svc:latest ${ECR_REGISTRY}/say2-6team-lab-svc:latest
docker push ${ECR_REGISTRY}/say2-6team-lab-svc:latest

echo "✅ All images pushed to ECR"
```

### Step 2: CloudFormation 스택 배포

```bash
cd infra

# 스택 생성
aws cloudformation create-stack \
  --stack-name say2-6team-compute-stack \
  --template-body file://compute-stack.yaml \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region us-east-1

# 배포 진행 상황 확인
aws cloudformation wait stack-create-complete \
  --stack-name say2-6team-compute-stack \
  --region us-east-1

# 배포 완료 확인
aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --region us-east-1 \
  --query 'Stacks[0].StackStatus'
```

### Step 3: ALB DNS 확인

```bash
# ALB DNS 이름 확인
ALB_DNS=$(aws cloudformation describe-stacks \
  --stack-name say2-6team-compute-stack \
  --region us-east-1 \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text)

echo "ALB DNS: ${ALB_DNS}"
echo "Orchestrator: http://${ALB_DNS}/orchestrator/health"
echo "ECG Service: http://${ALB_DNS}/ecg/health"
echo "CXR Service: http://${ALB_DNS}/cxr/healthz"
echo "LAB Service: http://${ALB_DNS}/lab/health"
```

### Step 4: 서비스 상태 확인

```bash
# ECS 클러스터 확인
aws ecs describe-clusters \
  --clusters say2-6team-ecs-cluster \
  --region us-east-1

# 서비스 상태 확인
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services \
    say2-6team-orchestrator-service \
    say2-6team-ecg-svc-service \
    say2-6team-cxr-svc-service \
    say2-6team-lab-svc-service \
  --region us-east-1 \
  --query 'services[*].[serviceName,status,runningCount,desiredCount]' \
  --output table
```

---

## 🔌 WebSocket 구성

### 1. ALB WebSocket 지원 설정

ALB는 기본적으로 WebSocket Upgrade를 지원하지만, Sticky Session 설정이 필요합니다:

```bash
# Target Group에 Sticky Session 활성화
aws elbv2 modify-target-group-attributes \
  --target-group-arn <ORCHESTRATOR_TG_ARN> \
  --attributes \
    Key=stickiness.enabled,Value=true \
    Key=stickiness.type,Value=lb_cookie \
    Key=stickiness.lb_cookie.duration_seconds,Value=86400
```

### 2. Orchestrator에 WebSocket 엔드포인트 추가

`final/central/backend/app/main.py`에 추가:

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import asyncio
from datetime import datetime

app = FastAPI()

# WebSocket 연결 관리자
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, patient_id: str):
        await websocket.accept()
        if patient_id not in self.active_connections:
            self.active_connections[patient_id] = set()
        self.active_connections[patient_id].add(websocket)
        print(f"✅ WebSocket connected: {patient_id}")
    
    def disconnect(self, websocket: WebSocket, patient_id: str):
        if patient_id in self.active_connections:
            self.active_connections[patient_id].discard(websocket)
            if not self.active_connections[patient_id]:
                del self.active_connections[patient_id]
        print(f"❌ WebSocket disconnected: {patient_id}")
    
    async def send_personal_message(self, message: dict, patient_id: str):
        """특정 환자에게 메시지 전송"""
        if patient_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[patient_id]:
                try:
                    await connection.send_json(message)
                except:
                    disconnected.add(connection)
            
            # 끊어진 연결 제거
            for conn in disconnected:
                self.active_connections[patient_id].discard(conn)

manager = ConnectionManager()

@app.websocket("/ws/{patient_id}")
async def websocket_endpoint(websocket: WebSocket, patient_id: str):
    await manager.connect(websocket, patient_id)
    try:
        while True:
            # 클라이언트로부터 heartbeat 수신
            data = await websocket.receive_text()
            
            # Pong 응답
            await websocket.send_json({
                "type": "pong",
                "timestamp": datetime.now().isoformat()
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket, patient_id)

# 모달 호출 시 진행 상황 푸시
async def notify_modal_progress(patient_id: str, modal: str, status: str, data: dict = None):
    """모달 진행 상황을 WebSocket으로 전송"""
    message = {
        "type": "modal_progress",
        "modal": modal,
        "status": status,  # "started", "processing", "completed", "error"
        "timestamp": datetime.now().isoformat(),
        "data": data
    }
    await manager.send_personal_message(message, patient_id)
```

### 3. React 프론트엔드 WebSocket 클라이언트

`frontend/src/lib/websocket.ts`:

```typescript
export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(
    private patientId: string,
    private onMessage: (data: any) => void,
    private onError?: (error: Event) => void,
    private onConnect?: () => void
  ) {}

  connect() {
    // ALB DNS 사용
    const wsUrl = `ws://${window.location.host}/ws/${this.patientId}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('✅ WebSocket connected');
      this.reconnectAttempts = 0;
      this.onConnect?.();
      
      // Heartbeat 시작 (30초마다)
      this.heartbeatInterval = setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data);
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('❌ WebSocket error:', error);
      this.onError?.(error);
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed');
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      this.reconnect();
    };
  }

  private reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = this.reconnectDelay * this.reconnectAttempts;
      console.log(`Reconnecting in ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        this.connect();
      }, delay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  disconnect() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.ws?.close();
  }

  send(data: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('WebSocket is not open. Current state:', this.ws?.readyState);
    }
  }
}
```

### 4. React 컴포넌트에서 사용

```typescript
import { useEffect, useState } from 'react';
import { WebSocketClient } from '../lib/websocket';

export function PatientDetailPage({ patientId }: { patientId: string }) {
  const [progress, setProgress] = useState<any[]>([]);
  const [wsConnected, setWsConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocketClient(
      patientId,
      (data) => {
        console.log('WebSocket message:', data);
        
        if (data.type === 'modal_progress') {
          setProgress(prev => {
            const existing = prev.find(p => p.modal === data.modal);
            if (existing) {
              return prev.map(p => 
                p.modal === data.modal 
                  ? { ...p, status: data.status, data: data.data, timestamp: data.timestamp }
                  : p
              );
            } else {
              return [...prev, {
                modal: data.modal,
                status: data.status,
                data: data.data,
                timestamp: data.timestamp
              }];
            }
          });
        }
      },
      (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
      },
      () => {
        console.log('WebSocket connected');
        setWsConnected(true);
      }
    );

    ws.connect();

    return () => ws.disconnect();
  }, [patientId]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className={`w-3 h-3 rounded-full ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        <span>{wsConnected ? '실시간 연결됨' : '연결 끊김'}</span>
      </div>

      <h2 className="text-xl font-bold mb-4">실시간 진행 상황</h2>
      <div className="space-y-2">
        {progress.map((item, idx) => (
          <div key={idx} className="p-4 border rounded">
            <div className="flex justify-between items-center">
              <span className="font-semibold">{item.modal}</span>
              <span className={`px-2 py-1 rounded text-sm ${
                item.status === 'completed' ? 'bg-green-100 text-green-800' :
                item.status === 'processing' ? 'bg-blue-100 text-blue-800' :
                item.status === 'error' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {item.status}
              </span>
            </div>
            {item.data && (
              <pre className="mt-2 text-xs bg-gray-50 p-2 rounded">
                {JSON.stringify(item.data, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## ✅ 테스트 및 검증

### 1. Health Check 테스트

```bash
ALB_DNS="<YOUR_ALB_DNS>"

# Orchestrator
curl http://${ALB_DNS}/orchestrator/health

# ECG Service
curl http://${ALB_DNS}/ecg/health

# CXR Service
curl http://${ALB_DNS}/cxr/healthz

# LAB Service
curl http://${ALB_DNS}/lab/health
```

### 2. 내부 통신 테스트 (Cloud Map DNS)

ECS Task에 접속하여 테스트:

```bash
# Task ID 확인
TASK_ARN=$(aws ecs list-tasks \
  --cluster say2-6team-ecs-cluster \
  --service-name say2-6team-orchestrator-service \
  --region us-east-1 \
  --query 'taskArns[0]' \
  --output text)

# ECS Exec 활성화 (최초 1회)
aws ecs update-service \
  --cluster say2-6team-ecs-cluster \
  --service say2-6team-orchestrator-service \
  --enable-execute-command \
  --region us-east-1

# Task에 접속
aws ecs execute-command \
  --cluster say2-6team-ecs-cluster \
  --task ${TASK_ARN} \
  --container orchestrator \
  --interactive \
  --command "/bin/bash"

# 내부에서 Cloud Map DNS 테스트
curl http://ecg-svc.say2-6team.local:8003/health
curl http://cxr-svc.say2-6team.local:8002/healthz
curl http://lab-svc.say2-6team.local:8000/health
```

### 3. WebSocket 연결 테스트

브라우저 콘솔에서:

```javascript
const ws = new WebSocket('ws://YOUR_ALB_DNS/ws/TEST001');

ws.onopen = () => {
  console.log('✅ Connected');
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  console.log('📨 Message:', JSON.parse(event.data));
};

ws.onerror = (error) => {
  console.error('❌ Error:', error);
};
```

### 4. End-to-End 테스트

```bash
# 트리아지 제출
curl -X POST http://${ALB_DNS}/orchestrator/triage/submit \
  -H "Content-Type: application/json" \
  -d '{
    "patient_id": "TEST001",
    "patient_info": {
      "age": 65,
      "sex": "M",
      "chief_complaint": "chest pain"
    },
    "data": {
      "ecg_path": "s3://say2-6team/mimic/ecg/waveforms/files/p18/p18161880/s40985856/40985856"
    }
  }'
```

---

## 🔧 트러블슈팅

### 문제 1: Task가 시작되지 않음

```bash
# Task 실패 이유 확인
aws ecs describe-tasks \
  --cluster say2-6team-ecs-cluster \
  --tasks <TASK_ARN> \
  --region us-east-1 \
  --query 'tasks[0].containers[0].reason'

# CloudWatch Logs 확인
aws logs tail /ecs/say2-6team-orchestrator --follow
```

**일반적인 원인:**
- ECR 이미지 pull 실패 → IAM Role 권한 확인
- Health Check 실패 → 포트 번호 확인
- 메모리 부족 → Task Definition CPU/Memory 증가

### 문제 2: ALB Health Check 실패

```bash
# Target Group 상태 확인
aws elbv2 describe-target-health \
  --target-group-arn <TARGET_GROUP_ARN> \
  --region us-east-1
```

**해결 방법:**
- Health Check 경로 확인 (`/health` vs `/healthz`)
- Security Group 규칙 확인
- 컨테이너 로그 확인

### 문제 3: Cloud Map DNS 해석 실패

```bash
# Service Discovery 상태 확인
aws servicediscovery list-services \
  --filters Name=NAMESPACE_ID,Values=<NAMESPACE_ID> \
  --region us-east-1

# DNS 레코드 확인
aws servicediscovery list-instances \
  --service-id <SERVICE_ID> \
  --region us-east-1
```

### 문제 4: WebSocket 연결 끊김

**원인:**
- ALB Idle Timeout (기본 60초)
- Sticky Session 미설정

**해결:**
```bash
# ALB Idle Timeout 증가
aws elbv2 modify-load-balancer-attributes \
  --load-balancer-arn <ALB_ARN> \
  --attributes Key=idle_timeout.timeout_seconds,Value=300
```

---

## 📊 모니터링

### CloudWatch Logs 확인

```bash
# 실시간 로그 확인
aws logs tail /ecs/say2-6team-orchestrator --follow
aws logs tail /ecs/say2-6team-ecg-svc --follow
aws logs tail /ecs/say2-6team-cxr-svc --follow
aws logs tail /ecs/say2-6team-lab-svc --follow
```

### ECS 메트릭 확인

```bash
# CPU/Memory 사용률
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=say2-6team-orchestrator-service Name=ClusterName,Value=say2-6team-ecs-cluster \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average \
  --region us-east-1
```

---

## 📝 체크리스트

### 배포 전
- [ ] 네트워크 스택 배포 완료
- [ ] Security Group 생성 완료
- [ ] IAM Role 생성 완료
- [ ] ECR 레포지토리 생성 완료
- [ ] Docker 이미지 빌드 및 푸시 완료

### 배포 중
- [ ] CloudFormation 스택 생성 성공
- [ ] ECS 클러스터 생성 확인
- [ ] 4개 서비스 모두 RUNNING 상태
- [ ] Target Group Health Check 통과

### 배포 후
- [ ] ALB Health Check 통과
- [ ] Cloud Map DNS 해석 확인
- [ ] WebSocket 연결 테스트 성공
- [ ] End-to-End 테스트 성공
- [ ] CloudWatch Logs 정상 출력

---

**작성일**: 2026-05-17  
**버전**: v1.0  
**담당**: 이정인 (lji)
