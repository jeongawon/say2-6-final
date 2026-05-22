# Cognito UserPool 변경 Handoff

## 변경 요약

| 항목 | 변경 내용 |
|------|-----------|
| 파일 | `architect/Security/security-stack.yaml` (Cognito 섹션) |
| 변경자 | yji |
| 변경일 | 2026-05-22 |
| 상태 | 코드 반영 완료, **배포 전** |

### 핵심 변경

- 로그인 방식: 이메일 → **사번(DR001, NR001)** 기반
- 셀프 가입 차단: `AdminCreateUserOnly: true`
- SSO 확장 대비: `custom:role` 속성, Token Validity 명시

---

## 파트별 영향 및 조치 사항

### 1. 프론트엔드 (Frontend)

| 항목 | 조치 필요 |
|------|-----------|
| 로그인 폼 | `email` 입력 → `사번` 입력으로 변경 |
| 회원가입 UI | 제거 (관리자만 생성 가능) |
| Cognito SDK 설정 | 새 UserPool ID, Client ID로 교체 |
| 토큰 처리 | Access Token 1시간, Refresh Token 30일 기준으로 갱신 로직 확인 |
| 에러 메시지 | "이메일 또는 비밀번호가 틀렸습니다" → "사번 또는 비밀번호가 틀렸습니다" |

### 2. 백엔드 / Central Orchestrator

| 항목 | 조치 필요 |
|------|-----------|
| JWT 검증 | 새 UserPool ID 기준 JWKS URL 갱신 |
| 사용자 식별 | `sub` 또는 `cognito:username` (= 사번) 기준으로 변경 |
| custom:role 활용 | JWT claims에서 `custom:role` 읽어서 권한 분기 가능 (선택) |
| .env 파일 | `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` 갱신 |

### 3. 인프라 / DevOps

| 항목 | 조치 필요 |
|------|-----------|
| 배포 순서 | security-stack 업데이트 → 새 ID 확인 → .env 갱신 → 서비스 재배포 |
| 사용자 재생성 | 기존 doctor1, nurse1 삭제됨 → AdminCreateUser API로 사번 기준 재생성 |
| Secrets Manager | Cognito ID 관련 Secret 있으면 갱신 |
| CloudFormation | Pool 재생성 발생 (DELETE+CREATE) — 다운타임 있음 |

### 4. 모바일 (해당 시)

| 항목 | 조치 필요 |
|------|-----------|
| Amplify/SDK 설정 | 새 UserPool ID, Client ID 반영 |
| 로그인 화면 | 사번 입력 UI로 변경 |

---

## 배포 후 전달해야 할 정보

배포 완료 후 아래 정보를 각 파트에 공유:

```
- 새 UserPool ID: (배포 후 확인)
- 새 UserPoolClient ID: (배포 후 확인)
- Cognito Domain: say2-6team-dev-{AccountId}-auth (유지 가능성 있음, 확인 필요)
- 로그인 방식: 사번 + 비밀번호
- 초기 비밀번호: 관리자가 생성 시 지정, 첫 로그인 시 변경 강제
```

---

## SSO 확장 시 추가 작업 (현재는 미적용)

현재 구조에서 SSO를 추가할 때 **Pool 재생성 없이** 아래만 추가하면 됨:

1. `AWS::Cognito::UserPoolIdentityProvider` 리소스 추가
   - SAML: 병원 AD/SSO 연동
   - OIDC: Google, Yahoo 등
2. `CognitoUserPoolClient`의 `SupportedIdentityProviders`에 IdP 이름 추가
3. `AttributeMapping`으로 IdP 속성 → Cognito 속성 매핑
   - 예: SAML `employeeId` → `username`, SAML `role` → `custom:role`

---

## ⚠️ 주의사항

1. **다운타임**: Pool 재생성 중 로그인 불가 (수 분)
2. **기존 사용자 소실**: 현재 2명(doctor1, nurse1) — 재생성 필요
3. **순서 중요**: security-stack 배포 → ID 확인 → 다른 서비스 설정 갱신 → 서비스 재배포
4. **롤백 불가**: 새 Pool이 생성되면 이전 Pool ID로 돌아갈 수 없음 (사용자도 복구 불가)

---

## 관련 파일

- `architect/Security/security-stack.yaml` — Cognito 리소스 정의
- `architect/Trouble Shooting/cognitouserpool_audit.md` — 변경 요청 원본
- `architect/Security/iam-policies/README.md` — IAM 정책 구조 참고
