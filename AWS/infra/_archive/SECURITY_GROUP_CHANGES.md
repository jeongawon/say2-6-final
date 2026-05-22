# 보안 그룹 임시 수정 사항 (say2-6team)

## 📅 수정 일시
- **날짜**: 2026-05-18
- **작업자**: 양정인 (lji)
- **사유**: ECS Compute Stack 배포 시 ALB 헬스체크 실패 해결

---

## 🔧 수정 내용

### 1. 모달 서비스 보안 그룹 - 인바운드 규칙 추가

ALB에서 각 모달 서비스로 헬스체크를 수행할 수 있도록 인바운드 규칙 추가

#### CXR 서비스 보안 그룹 (`say2-6team-cxr-sg`)
```
추가된 규칙:
- Protocol: TCP
- Port: 8002
- Source: sg-0d702017416dadb66 (say2-6team-alb-sg)
- Description: ALB health check to CXR service
```

#### ECG 서비스 보안 그룹 (`say2-6team-ecg-sg`)
```
추가된 규칙:
- Protocol: TCP
- Port: 8001
- Source: sg-0d702017416dadb66 (say2-6team-alb-sg)
- Description: ALB health check to ECG service
```

#### LAB 서비스 보안 그룹 (`say2-6team-lab-sg`)
```
추가된 규칙:
- Protocol: TCP
- Port: 8003
- Source: sg-0d702017416dadb66 (say2-6team-alb-sg)
- Description: ALB health check to LAB service
```

### 2. ALB 보안 그룹 - 아웃바운드 규칙 추가

ALB에서 각 모달 서비스로 트래픽을 보낼 수 있도록 아웃바운드 규칙 추가

#### ALB 보안 그룹 (`say2-6team-alb-sg`, `sg-0d702017416dadb66`)
```
추가된 규칙:
1. Protocol: TCP, Port: 8002, Destination: sg-03c32a9f9177f135c (say2-6team-cxr-sg)
2. Protocol: TCP, Port: 8001, Destination: sg-0bc2906a2abb53bbd (say2-6team-ecg-sg)
3. Protocol: TCP, Port: 8003, Destination: sg-0bb2f142d6291e965 (say2-6team-lab-sg)
```

---

## 🎯 현재 트래픽 흐름

```
프론트엔드
    ↓
ALB (say2-6team-alb)
    ↓
Orchestrator (중앙 서비스)
    ↓ (Service Discovery)
모달 서비스들 (CXR, ECG, LAB)
```

**참고**: 실제 운영 트래픽은 **프론트엔드 → ALB → Orchestrator → 모달** 순서로 흐르며, ALB는 Orchestrator만 호출합니다. 하지만 CloudFormation 스택 구성상 모든 서비스가 ALB에 등록되어 있어 헬스체크를 위한 규칙이 필요했습니다.

---

## 🔄 배포 완료 후 정리 작업 (선택사항)

배포가 완료되고 안정화된 후, 아키텍처를 실제 트래픽 흐름에 맞게 정리할 수 있습니다.

### 옵션 1: 보안 그룹 규칙 유지 (권장)
- **장점**: 현재 상태 유지, 추가 작업 불필요
- **단점**: 불필요한 네트워크 경로 존재 (실제로는 사용 안 함)
- **권장 사유**: 안정성 우선, 향후 아키텍처 변경 시 유연성 확보

### 옵션 2: 아키텍처 정리 (추후 작업)

#### 2-1. Compute Stack 수정
`infra/compute-stack.yaml`에서 다음 리소스 제거:
- `CxrSvcTargetGroup`
- `EcgSvcTargetGroup`
- `LabSvcTargetGroup`
- `CxrSvcListenerRule`
- `EcgSvcListenerRule`
- `LabSvcListenerRule`
- ECS Service의 `LoadBalancers` 섹션 (CXR, ECG, LAB만)

#### 2-2. 보안 그룹 규칙 제거

**모달 서비스 인바운드 규칙 제거:**
```bash
# CXR SG에서 ALB 인바운드 제거
aws ec2 revoke-security-group-ingress \
  --group-id sg-03c32a9f9177f135c \
  --protocol tcp \
  --port 8002 \
  --source-group sg-0d702017416dadb66 \
  --region ap-northeast-2

# ECG SG에서 ALB 인바운드 제거
aws ec2 revoke-security-group-ingress \
  --group-id sg-0bc2906a2abb53bbd \
  --protocol tcp \
  --port 8001 \
  --source-group sg-0d702017416dadb66 \
  --region ap-northeast-2

# LAB SG에서 ALB 인바운드 제거
aws ec2 revoke-security-group-ingress \
  --group-id sg-0bb2f142d6291e965 \
  --protocol tcp \
  --port 8003 \
  --source-group sg-0d702017416dadb66 \
  --region ap-northeast-2
```

**ALB 아웃바운드 규칙 제거:**
```bash
# ALB SG에서 CXR 아웃바운드 제거
aws ec2 revoke-security-group-egress \
  --group-id sg-0d702017416dadb66 \
  --protocol tcp \
  --port 8002 \
  --source-group sg-03c32a9f9177f135c \
  --region ap-northeast-2

# ALB SG에서 ECG 아웃바운드 제거
aws ec2 revoke-security-group-egress \
  --group-id sg-0d702017416dadb66 \
  --protocol tcp \
  --port 8001 \
  --source-group sg-0bc2906a2abb53bbd \
  --region ap-northeast-2

# ALB SG에서 LAB 아웃바운드 제거
aws ec2 revoke-security-group-egress \
  --group-id sg-0d702017416dadb66 \
  --protocol tcp \
  --port 8003 \
  --source-group sg-0bb2f142d6291e965 \
  --region ap-northeast-2
```

#### 2-3. Compute Stack 재배포
```bash
cd infra
aws cloudformation update-stack \
  --stack-name say2-6team-compute \
  --template-body file://compute-stack.yaml \
  --parameters file://compute-stack-params.json \
  --capabilities CAPABILITY_IAM \
  --region ap-northeast-2
```

---

## 📋 보안 그룹 ID 참조

| 리소스 | 보안 그룹 이름 | 보안 그룹 ID |
|--------|---------------|--------------|
| ALB | say2-6team-alb-sg | sg-0d702017416dadb66 |
| Orchestrator | say2-6team-central-sg | sg-07ec4d26ca22427d6 |
| CXR Service | say2-6team-cxr-sg | sg-03c32a9f9177f135c |
| ECG Service | say2-6team-ecg-sg | sg-0bc2906a2abb53bbd |
| LAB Service | say2-6team-lab-sg | sg-0bb2f142d6291e965 |

---

## ✅ 검증 방법

### 현재 보안 그룹 규칙 확인
```bash
# CXR SG 인바운드 확인
aws ec2 describe-security-groups \
  --region ap-northeast-2 \
  --group-ids sg-03c32a9f9177f135c \
  --query 'SecurityGroups[0].IpPermissions' \
  --output json

# ALB SG 아웃바운드 확인
aws ec2 describe-security-groups \
  --region ap-northeast-2 \
  --group-ids sg-0d702017416dadb66 \
  --query 'SecurityGroups[0].IpPermissionsEgress' \
  --output json
```

### 타겟 헬스 상태 확인
```bash
for tg in orchestrator-tg cxr-svc-tg ecg-svc-tg lab-svc-tg; do
  echo "=== say2-6team-${tg} ==="
  aws elbv2 describe-target-health \
    --target-group-arn $(aws elbv2 describe-target-groups --region ap-northeast-2 --query "TargetGroups[?TargetGroupName=='say2-6team-${tg}'].TargetGroupArn" --output text) \
    --region ap-northeast-2 \
    --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' \
    --output table
done
```

---

## 📞 문의

- **작업자**: 양정인 (lji)
- **관련 스택**: say2-6team-compute
- **리전**: ap-northeast-2 (Seoul)

---

## 📝 변경 이력

| 날짜 | 작업 | 작업자 |
|------|------|--------|
| 2026-05-18 | 초기 보안 그룹 규칙 추가 (ALB 헬스체크 허용) | 양정인 |
