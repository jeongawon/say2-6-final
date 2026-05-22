# Security Group 수정 요청 - ALB HTTP 접근 허용

> **요청자**: 이정인 (lji)  
> **날짜**: 2026-05-18  
> **우선순위**: 긴급 (프론트엔드 데모 차단 중)

---

## 📋 요약

**문제**: ALB에 HTTP (Port 80) 접근이 차단되어 프론트엔드에서 백엔드 API 호출 불가

**원인**: ALB Security Group에 HTTPS (443)만 허용되고 HTTP (80)가 없음

**요청**: ALB Security Group에 HTTP (Port 80) 인바운드 규칙 추가

---

## 🔍 현재 상태

### ALB 정보
- **ALB 이름**: `say2-6team-alb`
- **ALB DNS**: `say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com`
- **Security Group ID**: `sg-0d702017416dadb66`
- **리전**: `ap-northeast-2` (서울)

### 현재 Security Group 규칙

```json
{
  "IpProtocol": "tcp",
  "FromPort": 443,
  "ToPort": 443,
  "UserIdGroupPairs": [],
  "IpRanges": [
    {
      "Description": "Allow HTTPS to ALB",
      "CidrIp": "0.0.0.0/0"
    }
  ]
}
```

**문제점**: Port 80 (HTTP) 규칙이 없음

---

## ✅ 요청 사항

### 추가할 Security Group 규칙

| 항목 | 값 |
|------|-----|
| **Security Group ID** | `sg-0d702017416dadb66` |
| **Type** | Custom TCP |
| **Protocol** | TCP |
| **Port Range** | 80 |
| **Source** | `0.0.0.0/0` (Anywhere IPv4) |
| **Description** | Allow HTTP to ALB for development/demo |

### AWS CLI 명령어 (참고용)

```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-0d702017416dadb66 \
  --protocol tcp \
  --port 80 \
  --cidr 0.0.0.0/0 \
  --region ap-northeast-2
```

### AWS Console에서 수정 방법

1. **EC2 Console** → **Security Groups** 이동
2. Security Group ID `sg-0d702017416dadb66` 검색
3. **Inbound rules** 탭 → **Edit inbound rules** 클릭
4. **Add rule** 클릭
5. 다음 정보 입력:
   - Type: `Custom TCP`
   - Port range: `80`
   - Source: `0.0.0.0/0`
   - Description: `Allow HTTP to ALB for development/demo`
6. **Save rules** 클릭

---

## 🎯 필요한 이유

### 1. 프론트엔드 개발 환경
- 로컬 개발 환경 (`localhost:3000`)에서 ECS 백엔드 API 호출 필요
- 현재 HTTP로 통신 중 (개발 단계)
- HTTPS 인증서 미설정 상태

### 2. 데모 시연
- 프론트엔드 데모 시연을 위해 백엔드 API 접근 필요
- 브라우저에서 `http://say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com` 접근

### 3. Health Check 테스트
- ECS Service Health Check 테스트
- Target Group Health 확인
- 모니터링 및 디버깅

---

## 🔒 보안 고려사항

### 현재 상황
- **개발 단계**: 프론트엔드 개발 진행 중 (갈아엎는 중)
- **HTTP 필요 기간**: 최소 수개월 (프론트 완성 + 테스트 + 안정화)
- **용도**: 로컬 개발, 내부 테스트, 데모 시연

### 보안 완화 조치
1. **개발 환경 전용**
   - 실제 환자 데이터 사용 금지
   - 테스트 데이터만 사용
   - 민감 정보 전송 금지

2. **WAF 보호**
   - WAF는 이미 배포되어 있음 (Count 모드)
   - SQL Injection, XSS 등 기본 방어 활성화
   - Rate Limiting으로 DDoS 방어

3. **내부 접근 제한 (선택사항)**
   - 필요시 Security Group을 회사 IP로 제한 가능
   - 현재는 데모 시연을 위해 0.0.0.0/0 허용

### 프로덕션 전환 계획 (프론트 완성 후)
**예상 시기**: 프론트엔드 완성 + 테스트 완료 후 (수개월 후)

1. **ACM 인증서 발급**
   - Route 53 도메인 등록
   - ACM에서 SSL/TLS 인증서 발급

2. **ALB HTTPS Listener 추가**
   - Port 443 Listener 설정
   - 인증서 연결

3. **HTTP → HTTPS 리다이렉트**
   - Port 80 Listener를 HTTPS로 리다이렉트

4. **WAF Block 모드 전환**
   - Count → Block 모드

### 현재 vs 프로덕션
```
현재 (개발):  HTTP (Port 80) → ALB → ECS
              ↑ 프론트 개발 중, 테스트 데이터만 사용

프로덕션:     HTTPS (Port 443) → ALB → ECS
              HTTP (Port 80) → 301 Redirect → HTTPS
              ↑ 프론트 완성 후, 실제 환자 데이터 사용
```

---

## 📊 영향 범위

### 긍정적 영향
- ✅ 프론트엔드 개발 가능
- ✅ 데모 시연 가능
- ✅ API 테스트 가능
- ✅ Health Check 확인 가능

### 보안 영향
- ⚠️ HTTP 트래픽 암호화되지 않음 (개발 단계에서는 허용 가능)
- ⚠️ 인터넷에서 접근 가능 (데모용으로 필요)

### 완화 조치
- 개발/데모 단계에서만 사용
- 민감한 데이터 전송 금지
- 프로덕션 전환 시 HTTPS 필수

---

## 🧪 테스트 방법

규칙 추가 후 다음 명령어로 테스트:

```bash
# Health Check 테스트
curl http://say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com/orchestrator/health

# 정상 응답 예시:
# {"status": "healthy", "service": "orchestrator", "timestamp": "2026-05-18T..."}
```

또는 브라우저에서:
```
http://say2-6team-alb-698170641.ap-northeast-2.elb.amazonaws.com/orchestrator/health
```

---

## ⏰ 긴급도

**긴급**: 프론트엔드 데모 시연이 차단되어 있습니다.

- 프론트엔드는 정상 실행 중
- ECS 백엔드도 정상 실행 중 (Target healthy)
- ALB Security Group만 수정하면 즉시 연동 가능

**예상 소요 시간**: 5분 (규칙 추가 후 즉시 적용)

**사용 기간**: 수개월 (프론트엔드 개발 완성 + 테스트 + 안정화 기간)
- 프론트엔드가 현재 갈아엎는 중
- 완성 후에도 충분한 테스트 기간 필요
- 프로덕션 전환은 그 이후에 진행

---

## 📞 연락처

- **요청자**: 이정인 (lji)
- **팀**: 컴퓨팅 인프라
- **Slack**: `#infra-ecs` 또는 `#security`

---

## 📎 참고 자료

### 관련 리소스
- CloudFormation Stack: `say2-6team-compute`
- ECS Cluster: `say2-6team-ecs-cluster`
- ALB: `say2-6team-alb`
- Security Group: `sg-0d702017416dadb66`

### 확인 명령어
```bash
# ALB 상태 확인
aws elbv2 describe-load-balancers \
  --names say2-6team-alb \
  --region ap-northeast-2

# Security Group 규칙 확인
aws ec2 describe-security-groups \
  --group-ids sg-0d702017416dadb66 \
  --region ap-northeast-2

# Target Health 확인
aws elbv2 describe-target-health \
  --target-group-arn arn:aws:elasticloadbalancing:ap-northeast-2:666803869796:targetgroup/say2-6team-orchestrator-tg/88a962eade84d2e8 \
  --region ap-northeast-2
```

---

**문서 버전**: v1.0  
**최종 수정**: 2026-05-18  
**작성자**: 이정인 (lji)
