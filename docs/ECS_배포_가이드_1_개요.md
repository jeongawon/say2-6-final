# ECS 배포 가이드 (1/5) - 개요 및 사전 준비

> **대상 독자**: AWS와 Docker에 대한 사전 지식이 없는 팀원  
> **프로젝트**: say2-6team 응급의료 AI 진단보조 시스템  
> **작성일**: 2026-05-18

---

## 📚 목차

1. **[현재 문서] 개요 및 사전 준비**
2. [사전 요구사항 배포](./ECS_배포_가이드_2_사전요구사항.md)
3. [Docker 이미지 빌드 및 푸시](./ECS_배포_가이드_3_이미지빌드.md)
4. [ECS 컴퓨팅 스택 배포](./ECS_배포_가이드_4_컴퓨팅배포.md)
5. [배포 후 확인 및 트러블슈팅](./ECS_배포_가이드_5_확인및문제해결.md)

---

## 1. 이 가이드가 다루는 내용

이 가이드는 **say2-6team 프로젝트의 백엔드 서비스들을 AWS ECS(Elastic Container Service)에 배포하는 전체 과정**을 단계별로 설명합니다.

### 배포할 서비스 (총 4개)

| 서비스명 | 역할 | 포트 |
|---------|------|------|
| **Orchestrator** | 중앙 조정 서비스 (요청 분배, DB 관리) | 8000 |
| **CXR Service** | 흉부 X-ray 분석 AI 서비스 | 8002 |
| **ECG Service** | 심전도 분석 AI 서비스 | 8001 |
| **Lab Service** | 혈액검사 분석 AI 서비스 | 8003 |

---

## 2. 핵심 개념 이해하기

### 2.1 Docker란?

**Docker**는 애플리케이션을 "컨테이너"라는 격리된 환경에 패키징하는 기술입니다.

```
┌─────────────────────────────────────┐
│  Docker Container (컨테이너)         │
│  ┌───────────────────────────────┐  │
│  │  우리 Python 애플리케이션      │  │
│  │  + 필요한 라이브러리들         │  │
│  │  + Python 런타임              │  │
│  └───────────────────────────────┘  │
│  (어디서든 동일하게 실행됨)          │
└─────────────────────────────────────┘
```

**왜 Docker를 사용하나요?**
- ✅ "내 컴퓨터에서는 되는데..." 문제 해결
- ✅ 개발 환경과 운영 환경을 동일하게 유지
- ✅ 서비스별로 독립된 환경 제공

### 2.2 ECR (Elastic Container Registry)란?

**ECR**은 Docker 이미지를 저장하는 AWS의 저장소입니다.

```
개발자 컴퓨터                ECR (AWS)              ECS (AWS)
    │                        │                      │
    │  1. 이미지 빌드         │                      │
    ├──────────────────────> │                      │
    │  2. 이미지 푸시         │                      │
    │                        │  3. 이미지 가져오기   │
    │                        ├───────────────────>  │
    │                        │  4. 컨테이너 실행     │
```

**우리 프로젝트의 ECR 저장소 (4개)**:
- `say2-6team-orchestrator`
- `say2-6team-cxr-svc`
- `say2-6team-ecg-svc`
- `say2-6team-lab-svc`

### 2.3 ECS (Elastic Container Service)란?

**ECS**는 Docker 컨테이너를 AWS에서 실행하고 관리하는 서비스입니다.

```
ECS Cluster (say2-6team-ecs-cluster)
│
├─ Orchestrator Service
│  ├─ Task 1 (Container) ─ AZ-a
│  └─ Task 2 (Container) ─ AZ-c
│
├─ CXR Service
│  ├─ Task 1 (Container) ─ AZ-a
│  └─ Task 2 (Container) ─ AZ-c
│
├─ ECG Service
│  ├─ Task 1 (Container) ─ AZ-a
│  └─ Task 2 (Container) ─ AZ-c
│
└─ Lab Service
   ├─ Task 1 (Container) ─ AZ-a
   └─ Task 2 (Container) ─ AZ-c
```

**핵심 용어**:
- **Cluster**: 컨테이너들을 실행하는 논리적 그룹
- **Service**: 동일한 컨테이너를 여러 개 실행하고 관리
- **Task**: 실제로 실행되는 컨테이너 1개
- **AZ (Availability Zone)**: AWS 데이터센터 위치 (a, c = 서울 리전의 두 곳)

**왜 각 서비스마다 Task가 2개인가요?**
- 한 곳(AZ-a)이 장애가 나도 다른 곳(AZ-c)에서 서비스 계속 제공
- 무중단 배포 가능 (하나씩 교체)

### 2.4 ALB (Application Load Balancer)란?

**ALB**는 들어오는 요청을 여러 컨테이너에 분산시키는 교통 정리 역할을 합니다.

```
사용자 요청
    │
    ▼
┌─────────────────┐
│  ALB (로드밸런서) │
└─────────────────┘
    │
    ├─ /orchestrator/* ──> Orchestrator Service (Task 1, 2)
    ├─ /cxr/*          ──> CXR Service (Task 1, 2)
    ├─ /ecg/*          ──> ECG Service (Task 1, 2)
    └─ /lab/*          ──> Lab Service (Task 1, 2)
```

### 2.5 CloudFormation이란?

**CloudFormation**은 AWS 인프라를 코드로 관리하는 도구입니다.

```yaml
# compute-stack.yaml (예시)
Resources:
  ECSCluster:
    Type: AWS::ECS::Cluster
    Properties:
      ClusterName: say2-6team-ecs-cluster
```

**장점**:
- ✅ 인프라를 코드로 버전 관리
- ✅ 한 번에 여러 리소스 생성/삭제
- ✅ 실수 방지 (선언적 방식)

---

## 3. 전체 배포 흐름 (Big Picture)

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: 사전 요구사항 배포 (deploy-prerequisites.sh)       │
├─────────────────────────────────────────────────────────────┤
│  ✓ Network Stack 확인 (VPC, Subnet 등)                      │
│  ✓ Security Stack 확인 (IAM Role, Security Group 등)        │
│  ✓ ECR 저장소 4개 생성                                       │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: Docker 이미지 빌드 및 푸시 (build-and-push.sh)     │
├─────────────────────────────────────────────────────────────┤
│  1. Orchestrator 이미지 빌드 → ECR 푸시                      │
│  2. CXR Service 이미지 빌드 → ECR 푸시                       │
│  3. ECG Service 이미지 빌드 → ECR 푸시                       │
│  4. Lab Service 이미지 빌드 → ECR 푸시                       │
│  5. compute-stack-params.json 자동 생성                     │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: ECS 컴퓨팅 스택 배포 (deploy-compute.sh)           │
├─────────────────────────────────────────────────────────────┤
│  ✓ ECS Cluster 생성                                         │
│  ✓ ALB (로드밸런서) 생성                                     │
│  ✓ Target Group 4개 생성                                    │
│  ✓ ECS Service 4개 생성 (각 2개 Task)                       │
│  ✓ Service Discovery 설정                                   │
│  → 총 10-15분 소요                                          │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: 배포 확인 및 테스트                                │
├─────────────────────────────────────────────────────────────┤
│  ✓ Health Check 엔드포인트 테스트                            │
│  ✓ 서비스 상태 확인                                          │
│  ✓ 로그 확인                                                │
└─────────────────────────────────────────────────────────────┘
```

**예상 소요 시간**:
- Phase 1: 2-3분
- Phase 2: 15-20분 (이미지 빌드 시간)
- Phase 3: 10-15분 (CloudFormation 배포)
- **총 30-40분**

---

## 4. 사전 준비사항

### 4.1 필요한 도구 설치

#### ✅ AWS CLI 설치 확인

```bash
# 설치 확인
aws --version

# 출력 예시: aws-cli/2.x.x Python/3.x.x Windows/10 exe/AMD64
```

**설치되지 않은 경우**:
- Windows: https://aws.amazon.com/cli/ 에서 MSI 설치 파일 다운로드
- 설치 후 터미널 재시작 필요

#### ✅ Docker 설치 확인

```bash
# 설치 확인
docker --version

# 출력 예시: Docker version 24.x.x, build xxxxx
```

**설치되지 않은 경우**:
- Windows: Docker Desktop 설치 (https://www.docker.com/products/docker-desktop/)
- 설치 후 Docker Desktop 실행 필요

#### ✅ Git Bash 또는 WSL 설치 (Windows 사용자)

배포 스크립트는 Bash 스크립트이므로 Windows에서는 Git Bash 또는 WSL이 필요합니다.

- Git Bash: https://git-scm.com/downloads
- WSL: Windows 10/11에서 `wsl --install` 명령어 실행

### 4.2 AWS 자격 증명 설정

```bash
# AWS 자격 증명 설정
aws configure

# 입력 항목:
# AWS Access Key ID: (팀 리더에게 받은 키)
# AWS Secret Access Key: (팀 리더에게 받은 시크릿)
# Default region name: ap-northeast-2
# Default output format: json
```

**확인**:
```bash
# 현재 AWS 계정 확인
aws sts get-caller-identity

# 출력 예시:
# {
#     "UserId": "AIDAXXXXXXXXXXXXXXXXX",
#     "Account": "666803869796",
#     "Arn": "arn:aws:iam::666803869796:user/your-name"
# }
```

### 4.3 프로젝트 디렉토리 구조 확인

```
say2-6-final/
├── infra/                          # 배포 스크립트 위치
│   ├── build-and-push.sh           # Docker 이미지 빌드 및 푸시
│   ├── deploy-prerequisites.sh     # 사전 요구사항 배포
│   ├── deploy-compute.sh           # ECS 컴퓨팅 스택 배포
│   ├── compute-stack.yaml          # ECS CloudFormation 템플릿
│   └── compute-stack-params.json   # (자동 생성됨)
│
├── final/central/backend/          # Orchestrator 서비스
│   ├── Dockerfile
│   └── main.py
│
├── chest-svc-pre/                  # CXR 서비스
│   ├── Dockerfile
│   └── main.py
│
├── ECG-svc/                        # ECG 서비스
│   ├── Dockerfile
│   └── main.py
│
└── Lab-svc/                        # Lab 서비스
    ├── Dockerfile
    └── main.py
```

---

## 5. 배포 전 체크리스트

배포를 시작하기 전에 다음 항목들을 확인하세요:

- [ ] AWS CLI 설치 및 자격 증명 설정 완료
- [ ] Docker 설치 및 Docker Desktop 실행 중
- [ ] Git Bash 또는 WSL 설치 (Windows)
- [ ] 프로젝트 코드 최신 버전으로 pull 완료
- [ ] **Network Stack 배포 완료** (양정인 담당)
- [ ] **Security Stack 배포 완료** (보안팀 담당)
- [ ] **Aurora Stack 배포 완료** (DB 담당)

**중요**: Network, Security, Aurora Stack이 먼저 배포되어 있어야 합니다!

---

## 6. 다음 단계

이제 기본 개념을 이해했으니, 다음 문서로 넘어가세요:

👉 **[2. 사전 요구사항 배포](./ECS_배포_가이드_2_사전요구사항.md)**

---

## 7. 용어 정리

| 용어 | 설명 |
|------|------|
| **Docker** | 애플리케이션을 컨테이너로 패키징하는 기술 |
| **Container** | 애플리케이션과 의존성을 포함한 격리된 실행 환경 |
| **Image** | 컨테이너를 만들기 위한 템플릿 (설계도) |
| **ECR** | AWS의 Docker 이미지 저장소 |
| **ECS** | AWS의 컨테이너 실행 서비스 |
| **Fargate** | 서버 관리 없이 컨테이너를 실행하는 ECS 모드 |
| **Cluster** | 컨테이너들을 실행하는 논리적 그룹 |
| **Service** | 동일한 컨테이너를 여러 개 실행하고 관리 |
| **Task** | 실제로 실행되는 컨테이너 인스턴스 |
| **Task Definition** | Task를 어떻게 실행할지 정의한 설정 |
| **ALB** | Application Load Balancer, 트래픽 분산 |
| **Target Group** | ALB가 트래픽을 보낼 대상 그룹 |
| **CloudFormation** | AWS 인프라를 코드로 관리하는 도구 |
| **Stack** | CloudFormation으로 생성된 리소스 묶음 |
| **AZ** | Availability Zone, AWS 데이터센터 위치 |

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)
