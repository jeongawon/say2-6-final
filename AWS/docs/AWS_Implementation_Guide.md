# Dr. AI Radiologist (say-6) — AWS 인프라 구축 가이드

> 응급실 멀티모달 AI 시스템을 AWS에 배포하기 위한 팀 작업 분장 및 규약 문서

---

## 1. 개요

- **프로젝트 코드**: `say-6`
- **도구**: AWS CloudFormation (AWS 공식, 무료)
- **언어**: YAML (메인 템플릿) + JSON (IAM/KMS/WAF 정책 본문)
- **리전**: `ap-northeast-2` (서울)
- **리소스 prefix**: `say-6-`
- **참조 문서**: 응급실 멀티모달 AI - AWS 아키텍처.pdf

---

## 2. 역할 분담

| 담당자 | 영역 | PDF 챕터 | 작성 파일 |
|---|---|---|---|
| **양정인** | 🌐 네트워크 | §3 | `network-stack.yaml` |
| **양정인** | 🔐 보안 | §4 | `security-stack.yaml`, `iam-policies/*.json` |
| **이정인** | ⚙️ 컴퓨팅 | §2 | `compute-stack.yaml`, `task-definitions/*.json` |
| **홍경태** | 🗄️ DB | §5 | `data-stack.yaml` |
| **홍경태** | 📊 모니터링 | §6 | `monitoring-stack.yaml`, `policies/*.json` |

---

## 3. 폴더 구조

```
infra/
├── network-stack.yaml          (양정인)
├── security-stack.yaml         (양정인)
├── compute-stack.yaml          (이정인)
├── data-stack.yaml             (홍경태)
├── monitoring-stack.yaml       (홍경태)
│
├── iam-policies/               (양정인) IAM/KMS/WAF JSON 정책
│   ├── orchestrator-role.json
│   ├── ecs-task-role.json
│   ├── kms-key-policy.json
│   └── waf-rules.json
│
├── task-definitions/           (이정인) ECS Task 정의 JSON
│   ├── orchestrator-task.json
│   ├── ecg-svc-task.json
│   ├── cxr-svc-task.json
│   └── lab-svc-task.json
│
└── policies/                   (홍경태) S3/SNS 정책 JSON
    ├── s3-bucket-policy.json
    └── sns-topic-policy.json
```

---

## 4. 배포 순서 & 의존성

```
1단계: network-stack         (양정인) ── 베이스
   ↓ VPC, Subnet, Route Table, VPC Endpoint
2단계: security-stack        (양정인) ── SG는 VPC 필요
   ↓ SG, NACL, WAF, Cognito, IAM Role
3단계: data-stack            (홍경태) ── Aurora는 SG+Subnet 필요
   ↓ Aurora SLv2, S3, HAPI EC2, ChromaDB
4단계: compute-stack         (이정인) ── ECS는 위 전부 참조
   ↓ ECS Cluster, Service, ALB, Auto Scaling
5단계: monitoring-stack      (홍경태) ── 위 리소스 모니터링
       CloudWatch Alarms, SNS Topic (Email/SMS)
```

**핵심**: 파일 작성은 병렬 가능, 배포만 순서대로.

---

## 5. JSON 파일 필요량

| 담당 | JSON 필요도 | 사유 |
|---|---|---|
| 양정인 (보안) | 🔴 매우 많음 | IAM Role, KMS Key Policy, WAF Rules, Bucket Policy |
| 이정인 (컴퓨팅) | 🟡 약간 | ECS Task Definition `containerDefinitions` |
| 홍경태 (DB+모니터링) | 🟢 거의 없음 | S3 Bucket Policy, SNS Topic Policy |

---

## 6. 공통 규칙

- **명명 규칙**: `say-6-` + kebab-case (예: `say-6-vpc`, `say-6-orchestrator-role`)
- **공통 태그**: 모든 리소스에 부여

```yaml
Tags:
  - Key: Project
    Value: say-6
  - Key: Owner
    Value: <본인이름>
  - Key: Environment
    Value: phase1
```

- **PHI 로깅 금지**: 환자 이름·진단 본문 절대 CloudWatch Logs 금지 (의료법)
- **로컬 검증**: 작성 후 `cfn-lint template.yaml` 필수
- **PR 리뷰**: 본인 stack은 본인 PR, 머지 전 1명 이상 리뷰

---

## 7. 모니터링 정책 변경 사항

- ❌ SNS → Lambda → Slack Webhook 제거
- ✅ SNS → Email/SMS 직접 발송으로 단순화
- Email 구독은 배포 후 수신자가 확인 메일에서 `Confirm` 클릭 필요
- SMS는 Critical 알람만 (비용+노이즈 절감)

---

## 8. 작업 일정

| 일정 | 작업 | 담당 |
|---|---|---|
| Day 1 오전 | 킥오프 회의 (30분) — Export 규약 확정 | 전원 |
| Day 1 오후 ~ Day 2 | YAML 병렬 작성 | 각자 |
| Day 3 오전 | `cfn-lint` 문법 검증, Git PR 등록 | 각자 |
| Day 3 오후 | 1→2→3→4→5 순서 통합 배포 테스트 | 전원 |

---

## 9. 영역별 핵심 체크포인트

### 양정인 (네트워크)
- VPC CIDR: `10.0.0.0/16`
- Subnet 7종: Public×2, App×2, Data×2, Endpoints×1
- VPC Endpoint 6종 (NAT 미사용 → ~$55/월 절감)
- Cloud Map Namespace: `say-6.local` (TTL ≤ 60초)

### 양정인 (보안)
- SG 5종: alb-sg, central-sg, hapi-sg, aurora-sg, endpoints-sg
- IAM: Least Privilege, 명시적 Deny 포함
- WAF: 처음 1주는 Count Mode → 이후 Block 전환
- Secrets Manager 30일 자동 Rotation

### 이정인 (컴퓨팅)
- ECS Service 4종: orchestrator, ecg-svc, cxr-svc, lab-svc
- CXR-svc 메모리 8GB 필수 (OOM 방지)
- HAPI는 EC2 (Fargate 금지 — JVM warmup 30~60초)
- Rolling Update Min 50%, Max 200%

### 홍경태 (DB)
- Aurora SLv2: 0.5 ~ 4 ACU
- central_db + hapi 2개 DB 분리
- `fhir_sync_queue` 테이블 필수 (Graceful Degradation 핵심)
- JSONB + GIN 인덱스
- PITR 35일

### 홍경태 (모니터링)
- CloudWatch Alarm 7종 (PDF 표 6-1 참조)
- SNS Topic 2종: Critical, Warning
- Email/SMS 발송 (Slack 제외)
- Log Retention: ECS 30일, HAPI 90일, S3 export → Glacier 5년

---

## 10. 참고 링크

- 응급실 멀티모달 AI - AWS 아키텍처.pdf
- AWS CloudFormation 공식 문서: https://docs.aws.amazon.com/cloudformation/
- cfn-lint: https://github.com/aws-cloudformation/cfn-lint
- 질문 채널: `#infra-cfn`

---

**문서 버전**: v1.0 / **최종 수정**: 2026-05-13 / **프로젝트**: say-6
