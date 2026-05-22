# say-6 — CloudFormation Export 통합 규약

> 모든 Cross-Stack Reference는 본 규약을 따라야 합니다.
> 작성 시작 전 전원 합의 필수.

---

## 명명 규칙

```
say-6-<리소스종류>-<식별자>
```

- 모두 소문자 + kebab-case
- prefix는 반드시 `say-6-`
- AZ 구분이 필요한 경우 끝에 `-a` 또는 `-c`

---

## 통합 Export 테이블

### 🌐 네트워크 (양정인 출력)

| Export 이름 | 리소스 | 사용처 |
|---|---|---|
| `say-6-vpc-id` | VPC ID | 보안/컴퓨팅/DB 전부 |
| `say-6-vpc-cidr` | VPC CIDR (10.0.0.0/16) | SG 룰 정의 |
| `say-6-public-subnet-a` | Public Subnet (AZ-a) | ALB |
| `say-6-public-subnet-c` | Public Subnet (AZ-c) | ALB |
| `say-6-private-app-subnet-a` | App Subnet (AZ-a) | ECS Tasks |
| `say-6-private-app-subnet-c` | App Subnet (AZ-c) | ECS Tasks |
| `say-6-private-data-subnet-a` | Data Subnet (AZ-a) | Aurora, HAPI, Chroma |
| `say-6-private-data-subnet-c` | Data Subnet (AZ-c) | Aurora, HAPI, Chroma |
| `say-6-endpoints-subnet` | Endpoints Subnet | VPC Endpoint |

### 🔐 보안 (양정인 출력)

| Export 이름 | 리소스 | 사용처 |
|---|---|---|
| `say-6-alb-sg` | ALB Security Group | ALB |
| `say-6-central-sg` | ECS Task SG | ECS Service |
| `say-6-hapi-sg` | HAPI EC2 SG | HAPI EC2 |
| `say-6-aurora-sg` | Aurora SG | Aurora 클러스터 |
| `say-6-endpoints-sg` | VPC Endpoint SG | VPC Endpoint |
| `say-6-orchestrator-role-arn` | Orchestrator Task Role ARN | ECS Task Def |
| `say-6-ecg-task-role-arn` | ECG Task Role ARN | ECS Task Def |
| `say-6-cxr-task-role-arn` | CXR Task Role ARN | ECS Task Def |
| `say-6-lab-task-role-arn` | LAB Task Role ARN | ECS Task Def |
| `say-6-ecs-execution-role-arn` | ECS Execution Role ARN | 모든 ECS Task |
| `say-6-kms-key-id` | 데이터 암호화 KMS Key | Aurora, S3 |
| `say-6-kms-key-arn` | KMS Key ARN | 정책 참조 |

### 🗄️ DB (홍경태 출력)

| Export 이름 | 리소스 | 사용처 |
|---|---|---|
| `say-6-aurora-endpoint` | Aurora Writer Endpoint | ECS 환경변수 |
| `say-6-aurora-reader-endpoint` | Aurora Reader Endpoint | (Phase 3 대비) |
| `say-6-aurora-port` | Aurora Port (5432) | ECS 환경변수 |
| `say-6-aurora-secret-arn` | Aurora 비밀번호 Secret ARN | ECS Task Def |
| `say-6-s3-bucket-name` | S3 버킷 이름 | ECS 환경변수, 모니터링 |
| `say-6-s3-bucket-arn` | S3 버킷 ARN | IAM 정책 참조 |
| `say-6-hapi-private-ip` | HAPI EC2 Private IP | ECS Cloud Map |
| `say-6-chroma-private-ip` | ChromaDB EC2 Private IP | ECS 환경변수 |

### ⚙️ 컴퓨팅 (이정인 출력)

| Export 이름 | 리소스 | 사용처 |
|---|---|---|
| `say-6-ecs-cluster-name` | ECS Cluster 이름 | 모니터링 (CW 메트릭) |
| `say-6-ecs-cluster-arn` | ECS Cluster ARN | 모니터링 |
| `say-6-alb-arn` | ALB ARN | 모니터링 |
| `say-6-alb-dns-name` | ALB DNS Name | Route 53, 외부 접속 |
| `say-6-alb-hosted-zone-id` | ALB Hosted Zone ID | Route 53 Alias |
| `say-6-cloud-map-namespace-id` | Cloud Map Namespace ID | 서비스 디스커버리 |

### 📊 모니터링 (홍경태 출력)

| Export 이름 | 리소스 | 사용처 |
|---|---|---|
| `say-6-sns-critical-topic-arn` | Critical 알람 SNS Topic | 추가 알람 등록 시 |
| `say-6-sns-warning-topic-arn` | Warning 알람 SNS Topic | 추가 알람 등록 시 |

---

## 사용 예시

### Export 정의 (출력하는 측)

```yaml
# network-stack.yaml (양정인)
Outputs:
  VPCId:
    Description: say-6 VPC ID
    Value: !Ref MyVPC
    Export:
      Name: say-6-vpc-id   # ★ 규약 그대로

  PrivateAppSubnetA:
    Description: Private App Subnet in AZ-a
    Value: !Ref PrivateAppSubnetA
    Export:
      Name: say-6-private-app-subnet-a
```

### ImportValue 사용 (가져가는 측)

```yaml
# compute-stack.yaml (이정인)
Resources:
  ECSService:
    Type: AWS::ECS::Service
    Properties:
      NetworkConfiguration:
        AwsvpcConfiguration:
          Subnets:
            - !ImportValue say-6-private-app-subnet-a   # ★ 규약 그대로
            - !ImportValue say-6-private-app-subnet-c
          SecurityGroups:
            - !ImportValue say-6-central-sg
```

---

## 규약 준수 체크리스트 (배포 전 확인)

- [ ] 모든 Export Name이 `say-6-` prefix로 시작
- [ ] kebab-case 통일 (camelCase, snake_case 금지)
- [ ] AZ 구분 필요한 리소스는 `-a` / `-c` suffix
- [ ] Description 필드 작성 (CloudFormation 콘솔 가독성용)
- [ ] 본인 스택의 `Outputs` 섹션이 위 표와 일치
- [ ] 본인이 사용한 `!ImportValue` 이름이 위 표와 일치
- [ ] 위 표에 없는 새 Export 추가 시 → 팀 채널에서 합의 후 표 업데이트

---

## 변경 절차

새 Export가 필요해지면:
1. 팀 채널 (`#infra-cfn`)에 제안
2. 명명 규칙 검토 (`say-6-` + kebab-case)
3. 이 문서 표에 추가
4. 본인 stack에 반영

---

**문서 버전**: v1.0 / **최종 수정**: 2026-05-13 / **프로젝트**: say-6
