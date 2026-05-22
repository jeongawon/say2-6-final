# ECS 배포 가이드 (3/5) - Docker 이미지 빌드 및 푸시

> **이 단계의 목표**: 4개 서비스의 Docker 이미지를 빌드하고 ECR에 업로드

---

## 📚 목차

1. [개요 및 사전 준비](./ECS_배포_가이드_1_개요.md)
2. [사전 요구사항 배포](./ECS_배포_가이드_2_사전요구사항.md)
3. **[현재 문서] Docker 이미지 빌드 및 푸시**
4. [ECS 컴퓨팅 스택 배포](./ECS_배포_가이드_4_컴퓨팅배포.md)
5. [배포 후 확인 및 트러블슈팅](./ECS_배포_가이드_5_확인및문제해결.md)

---

## 1. 이 단계에서 하는 일

`build-and-push.sh` 스크립트는 다음 작업을 수행합니다:

```
1. ECR 로그인
   └─ Docker가 ECR에 이미지를 푸시할 수 있도록 인증

2. Orchestrator 이미지 빌드 및 푸시
   ├─ final/central/backend/Dockerfile 사용
   ├─ Docker 이미지 빌드
   └─ ECR에 푸시

3. CXR Service 이미지 빌드 및 푸시
   ├─ chest-svc-pre/Dockerfile 사용
   ├─ Docker 이미지 빌드 (AI 모델 포함, 용량 큼)
   └─ ECR에 푸시

4. ECG Service 이미지 빌드 및 푸시
   ├─ ECG-svc/Dockerfile 사용
   ├─ Docker 이미지 빌드
   └─ ECR에 푸시

5. Lab Service 이미지 빌드 및 푸시
   ├─ Lab-svc/Dockerfile 사용
   ├─ Docker 이미지 빌드
   └─ ECR에 푸시

6. compute-stack-params.json 자동 생성
   └─ 빌드된 이미지 URI를 파라미터 파일에 저장
```

**소요 시간**: 약 15-20분 (이미지 크기와 네트워크 속도에 따라 다름)

---

## 2. Docker 이미지 빌드 과정 이해하기

### 2.1 Dockerfile이란?

**Dockerfile**은 Docker 이미지를 만드는 레시피입니다.

```dockerfile
# 예시: Orchestrator Dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

CMD ["python", "main.py"]
```

**각 줄의 의미**:
- `FROM`: 베이스 이미지 (Python 3.11 설치된 리눅스)
- `WORKDIR`: 작업 디렉토리 설정
- `COPY`: 파일 복사
- `RUN`: 명령어 실행 (라이브러리 설치)
- `CMD`: 컨테이너 시작 시 실행할 명령어

### 2.2 빌드 → 태그 → 푸시 과정

```
┌─────────────────────────────────────────────────────────────┐
│  Step 1: 빌드 (Build)                                        │
├─────────────────────────────────────────────────────────────┤
│  docker build -t say2-6team-orchestrator:latest .           │
│                                                              │
│  Dockerfile을 읽어서 이미지 생성                              │
│  → 로컬에 "say2-6team-orchestrator:latest" 이미지 저장       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 2: 태그 (Tag)                                          │
├─────────────────────────────────────────────────────────────┤
│  docker tag say2-6team-orchestrator:latest \                │
│    666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/\      │
│    say2-6team-orchestrator:latest                           │
│                                                              │
│  ECR 주소를 포함한 태그 추가                                  │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Step 3: 푸시 (Push)                                         │
├─────────────────────────────────────────────────────────────┤
│  docker push 666803869796.dkr.ecr.ap-northeast-2.\         │
│    amazonaws.com/say2-6team-orchestrator:latest             │
│                                                              │
│  이미지를 ECR에 업로드                                        │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 ECR 이미지 URI 구조

```
666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-orchestrator:latest
│           │   │   │               │              │                      │
│           │   │   │               │              │                      └─ 태그 (버전)
│           │   │   │               │              └─ Repository 이름
│           │   │   │               └─ 도메인
│           │   │   └─ 리전 (서울)
│           │   └─ ECR 서비스
│           └─ Docker Registry
└─ AWS 계정 ID
```

---

## 3. 스크립트 내용 상세 분석

### 3.1 ECR 로그인

```bash
echo "Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | \
  docker login --username AWS --password-stdin \
    ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com
```

**무엇을 하나요?**
- AWS에서 임시 비밀번호를 받아서 Docker에 ECR 로그인
- 이 인증은 12시간 동안 유효합니다

**왜 필요한가요?**
- ECR은 AWS의 프라이빗 저장소이므로 인증 필요
- 로그인하지 않으면 이미지를 푸시할 수 없습니다

### 3.2 Orchestrator 빌드 및 푸시

```bash
echo "[1/4] Building and pushing Orchestrator..."
cd ../final/central/backend

IMAGE_NAME="${PROJECT_NAME}-orchestrator"
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${IMAGE_NAME}:latest"

# 빌드
docker build --no-cache -t ${IMAGE_NAME}:latest .

# 태그
docker tag ${IMAGE_NAME}:latest ${IMAGE_URI}

# 푸시
docker push ${IMAGE_URI}

ORCHESTRATOR_URI=${IMAGE_URI}
```

**주요 옵션**:
- `--no-cache`: 캐시 사용 안 함 (항상 최신 코드로 빌드)
- `-t`: 태그 이름 지정
- `.`: 현재 디렉토리의 Dockerfile 사용

**빌드 시간**:
- Orchestrator: 약 3-5분
- 의존성 라이브러리 설치 시간 포함

### 3.3 CXR Service 빌드 및 푸시

```bash
echo "[2/4] Building and pushing CXR Service..."
cd ../../../chest-svc-pre

IMAGE_NAME="${PROJECT_NAME}-cxr-svc"
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${IMAGE_NAME}:latest"

docker build --no-cache -t ${IMAGE_NAME}:latest .
docker tag ${IMAGE_NAME}:latest ${IMAGE_URI}
docker push ${IMAGE_URI}

CXR_URI=${IMAGE_URI}
```

**특징**:
- **가장 큰 이미지** (약 2-3GB)
- AI 모델 파일 포함 (`models/unet.onnx`, `models/densenet.onnx`)
- 빌드 시간: 약 5-8분
- 푸시 시간: 약 3-5분 (네트워크 속도에 따라)

### 3.4 ECG Service 빌드 및 푸시

```bash
echo "[3/4] Building and pushing ECG Service..."
cd ../ECG-svc

IMAGE_NAME="${PROJECT_NAME}-ecg-svc"
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${IMAGE_NAME}:latest"

docker build --no-cache -t ${IMAGE_NAME}:latest .
docker tag ${IMAGE_NAME}:latest ${IMAGE_URI}
docker push ${IMAGE_URI}

ECG_URI=${IMAGE_URI}
```

**빌드 시간**: 약 3-5분

### 3.5 Lab Service 빌드 및 푸시

```bash
echo "[4/4] Building and pushing Lab Service..."
cd ../Lab-svc

IMAGE_NAME="${PROJECT_NAME}-lab-svc"
IMAGE_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${IMAGE_NAME}:latest"

docker build --no-cache -t ${IMAGE_NAME}:latest .
docker tag ${IMAGE_NAME}:latest ${IMAGE_URI}
docker push ${IMAGE_URI}

LAB_URI=${IMAGE_URI}
```

**빌드 시간**: 약 2-4분

### 3.6 compute-stack-params.json 자동 생성

```bash
cd ../infra

cat > compute-stack-params.json <<EOF
[
  {
    "ParameterKey": "ProjectName",
    "ParameterValue": "${PROJECT_NAME}"
  },
  {
    "ParameterKey": "OrchestratorImageUri",
    "ParameterValue": "${ORCHESTRATOR_URI}"
  },
  {
    "ParameterKey": "CxrSvcImageUri",
    "ParameterValue": "${CXR_URI}"
  },
  {
    "ParameterKey": "EcgSvcImageUri",
    "ParameterValue": "${ECG_URI}"
  },
  {
    "ParameterKey": "LabSvcImageUri",
    "ParameterValue": "${LAB_URI}"
  }
]
EOF
```

**무엇을 하나요?**
- 빌드된 이미지의 URI를 JSON 파일로 저장
- 이 파일은 다음 단계(ECS 배포)에서 사용됩니다

**생성되는 파일 예시**:
```json
[
  {
    "ParameterKey": "ProjectName",
    "ParameterValue": "say2-6team"
  },
  {
    "ParameterKey": "OrchestratorImageUri",
    "ParameterValue": "666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-orchestrator:latest"
  },
  {
    "ParameterKey": "CxrSvcImageUri",
    "ParameterValue": "666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-cxr-svc:latest"
  },
  {
    "ParameterKey": "EcgSvcImageUri",
    "ParameterValue": "666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-ecg-svc:latest"
  },
  {
    "ParameterKey": "LabSvcImageUri",
    "ParameterValue": "666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-lab-svc:latest"
  }
]
```

---

## 4. 실행 방법

### 4.1 사전 확인

```bash
# Docker가 실행 중인지 확인
docker ps

# 정상이면 컨테이너 목록이 표시됨 (비어있어도 OK)
# 에러 발생 시 Docker Desktop 실행 필요
```

### 4.2 infra 디렉토리로 이동

```bash
cd infra
```

### 4.3 스크립트 실행 권한 부여

```bash
chmod +x build-and-push.sh
```

### 4.4 스크립트 실행

```bash
bash build-and-push.sh
```

**⚠️ 주의사항**:
- 이 과정은 **15-20분** 정도 걸립니다
- 중간에 중단하지 마세요
- 네트워크 연결이 안정적인지 확인하세요

---

## 5. 실행 결과 예시

### 5.1 정상 실행 시

```
==========================================
say2-6team Docker Build & Push
Region: ap-northeast-2 (Seoul)
==========================================

Checking prerequisites...
✅ AWS Account: 666803869796
✅ Docker found

Logging in to ECR...
Login Succeeded
✅ ECR login successful!

[1/4] Building and pushing Orchestrator...
Building say2-6team-orchestrator...
[+] Building 145.2s (12/12) FINISHED
 => [internal] load build definition from Dockerfile
 => => transferring dockerfile: 456B
 => [internal] load .dockerignore
 => [1/6] FROM docker.io/library/python:3.11-slim
 => [2/6] WORKDIR /app
 => [3/6] COPY requirements.txt .
 => [4/6] RUN pip install -r requirements.txt
 => [5/6] COPY . .
 => exporting to image
 => => exporting layers
 => => writing image sha256:abc123...
 => => naming to docker.io/library/say2-6team-orchestrator:latest

Tagging say2-6team-orchestrator...
Pushing say2-6team-orchestrator...
The push refers to repository [666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-orchestrator]
abc123: Pushed
def456: Pushed
latest: digest: sha256:xyz789... size: 2841
✅ Orchestrator pushed: 666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-orchestrator:latest

[2/4] Building and pushing CXR Service...
Building say2-6team-cxr-svc...
[+] Building 312.5s (15/15) FINISHED
 => [internal] load build definition from Dockerfile
 => [1/8] FROM docker.io/library/python:3.11-slim
 => [2/8] WORKDIR /app
 => [3/8] COPY requirements.txt .
 => [4/8] RUN pip install -r requirements.txt
 => [5/8] COPY models/ ./models/
 => [6/8] COPY . .
 => exporting to image
 => => exporting layers (2.3GB)
 => => writing image sha256:ghi789...
 => => naming to docker.io/library/say2-6team-cxr-svc:latest

Tagging say2-6team-cxr-svc...
Pushing say2-6team-cxr-svc...
The push refers to repository [666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-cxr-svc]
ghi789: Pushed (2.3GB)
jkl012: Pushed
latest: digest: sha256:mno345... size: 3521
✅ CXR Service pushed: 666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-cxr-svc:latest

[3/4] Building and pushing ECG Service...
✅ ECG Service pushed: 666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-ecg-svc:latest

[4/4] Building and pushing Lab Service...
✅ Lab Service pushed: 666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-lab-svc:latest

Creating compute-stack-params.json...
✅ compute-stack-params.json created!

==========================================
✅ All images built and pushed!
==========================================

Image URIs:
  Orchestrator: 666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-orchestrator:latest
  CXR Service:  666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-cxr-svc:latest
  ECG Service:  666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-ecg-svc:latest
  Lab Service:  666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-lab-svc:latest

Next step:
  bash deploy-compute.sh
```

---

## 6. 에러 상황 및 해결 방법

### 에러 1: Docker가 실행되지 않음

```
Cannot connect to the Docker daemon at unix:///var/run/docker.sock. 
Is the docker daemon running?
```

**원인**: Docker Desktop이 실행되지 않았습니다.

**해결 방법**:
1. Docker Desktop 실행
2. Docker가 완전히 시작될 때까지 대기 (1-2분)
3. 스크립트 재실행

### 에러 2: ECR 로그인 실패

```
Error: Cannot perform an interactive login from a non TTY device
```

**원인**: AWS 자격 증명 문제

**해결 방법**:
```bash
# AWS 자격 증명 재설정
aws configure

# ECR 로그인 수동 실행
aws ecr get-login-password --region ap-northeast-2 | \
  docker login --username AWS --password-stdin \
  666803869796.dkr.ecr.ap-northeast-2.amazonaws.com
```

### 에러 3: Dockerfile을 찾을 수 없음

```
❌ Dockerfile not found in final/central/backend
```

**원인**: 디렉토리 구조가 다르거나 Dockerfile이 없습니다.

**해결 방법**:
```bash
# Dockerfile 위치 확인
ls -la final/central/backend/Dockerfile
ls -la chest-svc-pre/Dockerfile
ls -la ECG-svc/Dockerfile
ls -la Lab-svc/Dockerfile

# 없으면 Git에서 최신 코드 pull
git pull origin main
```

### 에러 4: 디스크 공간 부족

```
no space left on device
```

**원인**: Docker 이미지가 디스크 공간을 많이 차지합니다.

**해결 방법**:
```bash
# 사용하지 않는 Docker 이미지 삭제
docker system prune -a

# 확인 후 'y' 입력
# 주의: 모든 사용하지 않는 이미지가 삭제됩니다
```

### 에러 5: 빌드 중 의존성 설치 실패

```
ERROR: Could not find a version that satisfies the requirement torch==2.0.0
```

**원인**: requirements.txt의 패키지 버전 문제

**해결 방법**:
1. 해당 서비스의 requirements.txt 확인
2. 패키지 버전 호환성 확인
3. 필요시 버전 수정 후 재빌드

### 에러 6: 푸시 중 네트워크 오류

```
error pushing image: failed to copy: io: read/write on closed pipe
```

**원인**: 네트워크 연결 불안정 또는 타임아웃

**해결 방법**:
1. 네트워크 연결 확인
2. 스크립트 재실행 (이미 빌드된 이미지는 재사용됨)
3. 또는 개별 서비스만 푸시:
   ```bash
   docker push 666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-cxr-svc:latest
   ```

---

## 7. 확인 방법

### 7.1 로컬 이미지 확인

```bash
# 빌드된 이미지 목록 확인
docker images | grep say2-6team

# 출력 예시:
# say2-6team-orchestrator  latest  abc123  5 minutes ago   1.2GB
# say2-6team-cxr-svc       latest  def456  10 minutes ago  2.8GB
# say2-6team-ecg-svc       latest  ghi789  15 minutes ago  1.5GB
# say2-6team-lab-svc       latest  jkl012  18 minutes ago  1.1GB
```

### 7.2 ECR에 푸시된 이미지 확인 (CLI)

```bash
# Orchestrator 이미지 확인
aws ecr describe-images \
  --repository-name say2-6team-orchestrator \
  --region ap-northeast-2 \
  --query 'imageDetails[0].[imageTags[0],imageSizeInBytes,imagePushedAt]' \
  --output table

# 출력 예시:
# --------------------------------
# |      DescribeImages          |
# +--------+----------+-----------+
# | latest | 1234567890 | 2026-05-18T10:30:00+00:00 |
# +--------+----------+-----------+
```

### 7.3 ECR에 푸시된 이미지 확인 (AWS Console)

1. AWS Console 로그인
2. **ECR** 서비스로 이동
3. 리전: **서울 (ap-northeast-2)**
4. 각 Repository 클릭하여 이미지 확인:
   - `say2-6team-orchestrator` → `latest` 태그 확인
   - `say2-6team-cxr-svc` → `latest` 태그 확인
   - `say2-6team-ecg-svc` → `latest` 태그 확인
   - `say2-6team-lab-svc` → `latest` 태그 확인

### 7.4 compute-stack-params.json 확인

```bash
# 파일 내용 확인
cat infra/compute-stack-params.json

# 또는
cat compute-stack-params.json  # (infra 디렉토리 내부에서)
```

**확인 사항**:
- 모든 이미지 URI가 올바르게 설정되어 있는지
- `REPLACE_WITH_ACTUAL_IMAGE_URI` 같은 플레이스홀더가 없는지

---

## 8. 이미지 재빌드가 필요한 경우

코드를 수정한 후 다시 배포하려면:

### 8.1 전체 재빌드

```bash
# infra 디렉토리에서
bash build-and-push.sh
```

### 8.2 특정 서비스만 재빌드

```bash
# 예: Orchestrator만 재빌드
cd final/central/backend

docker build --no-cache -t say2-6team-orchestrator:latest .

docker tag say2-6team-orchestrator:latest \
  666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-orchestrator:latest

docker push 666803869796.dkr.ecr.ap-northeast-2.amazonaws.com/say2-6team-orchestrator:latest
```

### 8.3 ECS 서비스 업데이트

이미지를 재푸시한 후 ECS 서비스를 업데이트해야 새 이미지가 배포됩니다:

```bash
# Orchestrator 서비스 강제 재배포
aws ecs update-service \
  --cluster say2-6team-ecs-cluster \
  --service say2-6team-orchestrator-service \
  --force-new-deployment \
  --region ap-northeast-2
```

---

## 9. 빌드 시간 단축 팁

### 9.1 Docker 빌드 캐시 활용

`--no-cache` 옵션을 제거하면 빌드 캐시를 사용하여 시간 단축:

```bash
# 캐시 사용 (빠름, 하지만 최신 코드 반영 안 될 수 있음)
docker build -t say2-6team-orchestrator:latest .

# 캐시 미사용 (느림, 하지만 항상 최신 코드 반영)
docker build --no-cache -t say2-6team-orchestrator:latest .
```

**권장**: 첫 배포는 `--no-cache`, 이후 작은 수정은 캐시 사용

### 9.2 멀티스테이지 빌드 (고급)

Dockerfile을 멀티스테이지로 작성하면 최종 이미지 크기 감소:

```dockerfile
# 빌드 스테이지
FROM python:3.11 as builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --user -r requirements.txt

# 실행 스테이지
FROM python:3.11-slim
WORKDIR /app
COPY --from=builder /root/.local /root/.local
COPY . .
CMD ["python", "main.py"]
```

---

## 10. 다음 단계

Docker 이미지 빌드 및 푸시가 완료되었습니다! 이제 ECS에 배포할 차례입니다.

👉 **[4. ECS 컴퓨팅 스택 배포](./ECS_배포_가이드_4_컴퓨팅배포.md)**

---

## 11. 체크리스트

이 단계를 완료했다면 다음 항목들을 확인하세요:

- [ ] `build-and-push.sh` 스크립트 실행 완료
- [ ] ECR 로그인 성공
- [ ] 4개 서비스 이미지 빌드 완료
  - [ ] Orchestrator
  - [ ] CXR Service
  - [ ] ECG Service
  - [ ] Lab Service
- [ ] 4개 이미지 ECR 푸시 완료
- [ ] `compute-stack-params.json` 파일 생성 확인
- [ ] ECR Console 또는 CLI로 이미지 확인 완료

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)
