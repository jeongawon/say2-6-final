# ECS 배포 가이드 - 전체 목차

> **say2-6team 응급의료 AI 진단보조 시스템**  
> **AWS ECS (Elastic Container Service) 배포 완전 가이드**

---

## 📖 문서 개요

이 가이드는 AWS와 Docker에 대한 사전 지식이 없는 팀원도 따라할 수 있도록 작성된 **단계별 ECS 배포 가이드**입니다.

**대상 독자**: 개발자, DevOps 엔지니어, 인프라 담당자  
**난이도**: 초급 ~ 중급  
**예상 소요 시간**: 약 1-2시간

---

## 📚 문서 구성

### [1. 개요 및 사전 준비](./ECS_배포_가이드_1_개요.md)
- ECS, Docker, ECR 등 핵심 개념 이해
- 전체 배포 흐름 (Big Picture)
- 필요한 도구 설치 및 설정
- AWS 자격 증명 설정
- 배포 전 체크리스트

**읽는 시간**: 15분  
**실습 시간**: 10분

---

### [2. 사전 요구사항 배포](./ECS_배포_가이드_2_사전요구사항.md)
- Network Stack 확인
- Security Stack 확인
- ECR Repository 4개 생성
- `deploy-prerequisites.sh` 스크립트 실행

**읽는 시간**: 10분  
**실습 시간**: 5분

---

### [3. Docker 이미지 빌드 및 푸시](./ECS_배포_가이드_3_이미지빌드.md)
- Docker 이미지 빌드 과정 이해
- 4개 서비스 이미지 빌드
- ECR에 이미지 푸시
- `build-and-push.sh` 스크립트 실행
- `compute-stack-params.json` 자동 생성

**읽는 시간**: 15분  
**실습 시간**: 20-30분 (빌드 시간 포함)

---

### [4. ECS 컴퓨팅 스택 배포](./ECS_배포_가이드_4_컴퓨팅배포.md)
- CloudFormation Stack 구조 이해
- ECS Cluster, ALB, Service 생성
- `deploy-compute.sh` 스크립트 실행
- AWS Console에서 진행 상황 확인

**읽는 시간**: 15분  
**실습 시간**: 15-20분 (배포 시간 포함)

---

### [5. 배포 후 확인 및 트러블슈팅](./ECS_배포_가이드_5_확인및문제해결.md)
- Health Check 엔드포인트 테스트
- ECS Service 상태 확인
- Target Group Health 확인
- CloudWatch Logs 확인
- 일반적인 문제 및 해결 방법
- 모니터링 및 알람 설정

**읽는 시간**: 20분  
**실습 시간**: 15-20분

---

## 🚀 빠른 시작 (Quick Start)

### 전제 조건
- AWS CLI 설치 및 자격 증명 설정 완료
- Docker Desktop 설치 및 실행 중
- Git Bash 또는 WSL 설치 (Windows)
- Network, Security, Aurora Stack 배포 완료

### 3단계 배포

```bash
# 1단계: 사전 요구사항 배포 (2-3분)
cd infra
bash deploy-prerequisites.sh

# 2단계: Docker 이미지 빌드 및 푸시 (15-20분)
bash build-and-push.sh

# 3단계: ECS 컴퓨팅 스택 배포 (10-15분)
bash deploy-compute.sh
```

**총 소요 시간**: 약 30-40분

---

## 📋 배포 체크리스트

### 사전 준비
- [ ] AWS CLI 설치 및 자격 증명 설정
- [ ] Docker Desktop 설치 및 실행
- [ ] Git Bash 또는 WSL 설치 (Windows)
- [ ] 프로젝트 코드 최신 버전 pull

### 의존성 Stack
- [ ] Network Stack 배포 완료 (양정인)
- [ ] Security Stack 배포 완료 (보안팀)
- [ ] Aurora Stack 배포 완료 (DB 팀)

### 배포 단계
- [ ] ECR Repository 4개 생성
- [ ] Docker 이미지 4개 빌드 및 푸시
- [ ] compute-stack-params.json 생성
- [ ] ECS Compute Stack 배포

### 배포 확인
- [ ] 4개 Service 모두 ACTIVE 상태
- [ ] 각 Service마다 2개 Task RUNNING
- [ ] 모든 Target이 healthy 상태
- [ ] Health Check 엔드포인트 정상 응답
- [ ] CloudWatch Logs 에러 없음

---

## 🏗️ 배포되는 인프라

### ECS Cluster
- **이름**: `say2-6team-ecs-cluster`
- **타입**: Fargate (서버리스)
- **Services**: 4개
- **Tasks**: 8개 (각 Service 2개)

### 서비스 목록

| 서비스 | CPU | 메모리 | Tasks | 포트 |
|--------|-----|--------|-------|------|
| Orchestrator | 0.5 vCPU | 1 GB | 2 | 8000 |
| CXR Service | 2 vCPU | 8 GB | 2 | 8002 |
| ECG Service | 1 vCPU | 2 GB | 2 | 8001 |
| Lab Service | 1 vCPU | 2 GB | 2 | 8003 |

### Application Load Balancer
- **이름**: `say2-6team-alb`
- **타입**: Internet-facing
- **리스너**: HTTP Port 80
- **라우팅**: 경로 기반 (`/orchestrator/*`, `/cxr/*`, `/ecg/*`, `/lab/*`)

### Service Discovery
- **Namespace**: `say2-6team.local`
- **DNS 레코드**: 4개 (각 서비스마다)

---

## 💰 예상 비용

### 월간 비용 (서울 리전, On-Demand)

| 항목 | 비용 |
|------|------|
| Fargate (Baseline) | ~$921/월 |
| ALB | ~$25/월 |
| CloudWatch Logs | ~$10/월 |
| **총 Baseline** | **~$956/월** |
| Auto Scaling 평균 (+25%) | ~$1,200/월 |

### 비용 절감 옵션
- **Fargate Savings Plans (1년)**: 20% 절감 → ~$736/월
- **Compute Savings Plans (1년)**: 17% 절감 → ~$764/월
- **Reserved Capacity (3년)**: 최대 50% 절감

---

## 🔧 유용한 명령어

### 서비스 상태 확인
```bash
aws ecs describe-services \
  --cluster say2-6team-ecs-cluster \
  --services say2-6team-orchestrator-service \
  --region ap-northeast-2
```

### 로그 확인
```bash
aws logs tail /drai/central-backend --follow --region ap-northeast-2
```

### 서비스 재배포
```bash
aws ecs update-service \
  --cluster say2-6team-ecs-cluster \
  --service say2-6team-orchestrator-service \
  --force-new-deployment \
  --region ap-northeast-2
```

### ALB DNS 확인
```bash
aws cloudformation describe-stacks \
  --stack-name say2-6team-compute \
  --region ap-northeast-2 \
  --query 'Stacks[0].Outputs[?OutputKey==`ALBDNSName`].OutputValue' \
  --output text
```

---

## 🆘 문제 해결

### 자주 발생하는 문제

1. **Task가 계속 재시작됨**
   - 로그 확인: `aws logs tail /drai/central-backend --since 30m`
   - Health Check 경로 확인
   - 메모리 부족 확인

2. **504 Gateway Timeout**
   - Target Health 확인
   - Task 상태 확인
   - Security Group 확인

3. **이미지를 가져올 수 없음**
   - ECR 이미지 존재 확인
   - IAM Role 권한 확인
   - 이미지 재빌드 및 푸시

**자세한 내용**: [5. 배포 후 확인 및 트러블슈팅](./ECS_배포_가이드_5_확인및문제해결.md)

---

## 📞 지원

### 팀 내부 채널
- **일반 질문**: `#infra-ecs`
- **긴급 이슈**: `#infra-emergency`

### 담당자
- **ECS/컴퓨팅**: 이정인 (lji)
- **네트워크**: 양정인 (yji)
- **보안**: 보안팀
- **데이터베이스**: 홍경태 (hkt)

---

## 📚 추가 리소스

### 프로젝트 문서
- [AWS 컴퓨팅 설계 문서](../AWS/AWS_Compute_Design_v1.md)
- [AWS 구현 가이드](../AWS/AWS_Implementation_Guide.md)
- [AWS 네트워크 설계](../AWS/AWS_Network_Design_v1.md)
- [AWS 보안 설계](../AWS/AWS_Security_Design_v1.md)

### AWS 공식 문서
- [Amazon ECS 개발자 가이드](https://docs.aws.amazon.com/ecs/)
- [AWS Fargate 사용 가이드](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html)
- [Application Load Balancer](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/)
- [Amazon ECR 사용 가이드](https://docs.aws.amazon.com/ecr/)

---

## 📝 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| v1.0 | 2026-05-18 | 이정인 | 초안 작성 |

---

## 📄 라이선스

이 문서는 say2-6team 프로젝트의 내부 문서입니다.

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)  
**프로젝트**: say2-6team 응급의료 AI 진단보조 시스템
