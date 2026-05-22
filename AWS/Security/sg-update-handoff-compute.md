# Security Stack SG 업데이트 — 컴퓨팅 담당 공유

> 업데이트 일시: 2026-05-18  
> 스택: `say2-6team-security`  
> 사유: compute-stack의 ALB → 모달 서비스 헬스체크 허용

---

## 변경 내용

ALB가 모달 서비스(ECG/CXR/LAB)에 직접 헬스체크를 보낼 수 있도록 SG 규칙 6개 추가.

### 추가된 규칙

| SG | 방향 | 포트 | 소스/대상 | 용도 |
|---|---|:---:|---|---|
| `say2-6team-alb-sg` | Outbound | 8001 | → `ecg-sg` | ALB → ECG 헬스체크 |
| `say2-6team-alb-sg` | Outbound | 8002 | → `cxr-sg` | ALB → CXR 헬스체크 |
| `say2-6team-alb-sg` | Outbound | 8003 | → `lab-sg` | ALB → LAB 헬스체크 |
| `say2-6team-ecg-sg` | Inbound | 8001 | ← `alb-sg` | ECG가 ALB 헬스체크 수신 |
| `say2-6team-cxr-sg` | Inbound | 8002 | ← `alb-sg` | CXR가 ALB 헬스체크 수신 |
| `say2-6team-lab-sg` | Inbound | 8003 | ← `alb-sg` | LAB이 ALB 헬스체크 수신 |

### 현재 트래픽 경로 (업데이트 후)

```
ALB
 ├─ :8000 → Orchestrator (central-sg)   ← 기존
 ├─ :8001 → ECG (ecg-sg)                ← 신규 (헬스체크)
 ├─ :8002 → CXR (cxr-sg)                ← 신규 (헬스체크)
 └─ :8003 → LAB (lab-sg)                ← 신규 (헬스체크)
```

---

## 컴퓨팅 담당 확인 사항

- [x] security-stack 업데이트 배포 완료
- [ ] ALB Target Group 헬스체크 정상 확인 (`healthy` 상태)
- [ ] 모달 서비스 정상 응답 확인

### 헬스체크 확인 명령

```bash
for tg in orchestrator-tg cxr-svc-tg ecg-svc-tg lab-svc-tg; do
  echo "=== say2-6team-${tg} ==="
  aws elbv2 describe-target-health \
    --target-group-arn $(aws elbv2 describe-target-groups \
      --region ap-northeast-2 --profile say2-6team \
      --query "TargetGroups[?TargetGroupName=='say2-6team-${tg}'].TargetGroupArn" \
      --output text) \
    --region ap-northeast-2 --profile say2-6team \
    --query 'TargetHealthDescriptions[].[Target.Id,TargetHealth.State]' \
    --output table
done
```

---

## 참고

- 이 변경은 CloudFormation `security-stack.yaml`에 반영됨 (영구적)
- 이전에 CLI로 직접 추가한 규칙이 있었다면 CloudFormation이 관리하는 것으로 통합됨
- 추후 `update-stack` 해도 규칙 유지됨
