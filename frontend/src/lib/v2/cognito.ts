// say-6 v2 — AWS Cognito JWT 인증 헬퍼
//
// 운영 환경 사용 흐름:
//   1) Cognito User Pool + Hosted UI 활성화
//   2) IdP (병원 AD/Okta) SAML 또는 OIDC 등록
//   3) signInWithSSO() → Hosted UI로 redirect
//   4) 콜백 URL에서 code 받음 → exchangeCodeForTokens()
//   5) idToken 디코드 → user 정보 + groups(role) 추출
//   6) 모든 API 호출에 Authorization: Bearer <accessToken>
//
// 환경변수 (frontend/.env):
//   VITE_COGNITO_DOMAIN=say-6.auth.ap-northeast-2.amazoncognito.com
//   VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxx
//   VITE_COGNITO_REDIRECT_URI=https://app.say-6.com/v2/auth/callback
//   VITE_COGNITO_REGION=ap-northeast-2
//   VITE_COGNITO_USER_POOL_ID=ap-northeast-2_xxxxxxxxx

import type { UserRole } from "./auth";

export interface CognitoTokens {
  idToken: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
}

export interface CognitoIdTokenPayload {
  sub: string;
  email?: string;
  name?: string;
  "cognito:groups"?: string[];      // 예: ["doctor"] 또는 ["nurse"]
  "cognito:username"?: string;      // = 사번 (DR001, NR001)
  "custom:role"?: string;           // 사번 기반 역할 (doctor/nurse)
  preferred_username?: string;
  exp: number;
  iat: number;
}

const TOKEN_STORAGE_KEY = "say6_cognito_tokens";

// Cognito IDP REST 엔드포인트 (USER_PASSWORD_AUTH 직접 로그인용)
function idpUrl(): string {
  const region = import.meta.env.VITE_COGNITO_REGION
    || (import.meta.env.VITE_COGNITO_USER_POOL_ID?.split("_")[0])
    || "ap-northeast-2";
  return `https://cognito-idp.${region}.amazonaws.com/`;
}

async function cognitoIdp(target: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(idpUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": `AWSCognitoIdentityProviderService.${target}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = String(json.__type || "").split("#").pop() || "";
    const err = new Error(json.message || "Cognito 요청 실패") as Error & { code?: string };
    err.code = code;
    throw err;
  }
  return json;
}

function toTokens(ar: any, fallbackRefresh?: string): CognitoTokens {
  const tokens: CognitoTokens = {
    idToken: ar.IdToken,
    accessToken: ar.AccessToken,
    refreshToken: ar.RefreshToken ?? fallbackRefresh ?? "",
    expiresAt: Date.now() + (ar.ExpiresIn ?? 3600) * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

export type PasswordAuthResult =
  | { status: "success"; tokens: CognitoTokens }
  | { status: "new_password_required"; session: string; username: string };

// ─────────────────────────────────────────────────────────────
// 1b. 사번 + 비밀번호 직접 로그인 (USER_PASSWORD_AUTH) — Hosted UI 미사용
// ─────────────────────────────────────────────────────────────
export async function signInWithPassword(username: string, password: string): Promise<PasswordAuthResult> {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const json = await cognitoIdp("InitiateAuth", {
    AuthFlow: "USER_PASSWORD_AUTH",
    ClientId: clientId,
    AuthParameters: { USERNAME: username, PASSWORD: password },
  });
  if (json.ChallengeName === "NEW_PASSWORD_REQUIRED") {
    return { status: "new_password_required", session: json.Session, username };
  }
  return { status: "success", tokens: toTokens(json.AuthenticationResult) };
}

// 첫 로그인 — 관리자 발급 임시 비밀번호 → 새 비밀번호로 변경
export async function completeNewPassword(username: string, newPassword: string, session: string): Promise<CognitoTokens> {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const json = await cognitoIdp("RespondToAuthChallenge", {
    ChallengeName: "NEW_PASSWORD_REQUIRED",
    ClientId: clientId,
    Session: session,
    ChallengeResponses: { USERNAME: username, NEW_PASSWORD: newPassword },
  });
  return toTokens(json.AuthenticationResult);
}

// Refresh Token으로 Access/Id 토큰 갱신 (Access 1h / Refresh 30d 정책)
export async function refreshTokens(refreshToken: string): Promise<CognitoTokens | null> {
  const clientId = import.meta.env.VITE_COGNITO_CLIENT_ID;
  try {
    const json = await cognitoIdp("InitiateAuth", {
      AuthFlow: "REFRESH_TOKEN_AUTH",
      ClientId: clientId,
      AuthParameters: { REFRESH_TOKEN: refreshToken },
    });
    return toTokens(json.AuthenticationResult, refreshToken);
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────
// 1. 로그인 — Cognito Hosted UI로 redirect
// ─────────────────────────────────────────────────────────────
export function signInWithSSO(): void {
  const domain      = import.meta.env.VITE_COGNITO_DOMAIN;
  const clientId    = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI;

  if (!domain || !clientId || !redirectUri) {
    console.warn("[Cognito] 환경변수 누락 — 데모 모드로 fallback");
    return;
  }

  const url = new URL(`https://${domain}/oauth2/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("redirect_uri", redirectUri);
  // SAML/OIDC IdP를 직접 지정하려면:
  //   url.searchParams.set("identity_provider", "HospitalAD");

  window.location.href = url.toString();
}

// ─────────────────────────────────────────────────────────────
// 2. 콜백 — code → tokens 교환
// ─────────────────────────────────────────────────────────────
export async function exchangeCodeForTokens(code: string): Promise<CognitoTokens> {
  const domain      = import.meta.env.VITE_COGNITO_DOMAIN;
  const clientId    = import.meta.env.VITE_COGNITO_CLIENT_ID;
  const redirectUri = import.meta.env.VITE_COGNITO_REDIRECT_URI;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch(`https://${domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`Cognito token exchange 실패: ${res.status}`);

  const json = await res.json();
  const tokens: CognitoTokens = {
    idToken: json.id_token,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  saveTokens(tokens);
  return tokens;
}

// ─────────────────────────────────────────────────────────────
// 3. JWT 디코드 (서명 검증 없음 — 클라이언트는 페이로드만 읽음)
//    서명 검증은 백엔드(API Gateway / ALB)에서 수행
// ─────────────────────────────────────────────────────────────
export function decodeIdToken(idToken: string): CognitoIdTokenPayload | null {
  try {
    const [, payload] = idToken.split(".");
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return null;
  }
}

// Cognito Groups → UserRole 매핑
export function roleFromGroups(groups?: string[]): UserRole | undefined {
  if (!groups) return undefined;
  if (groups.includes("doctor")) return "doctor";
  if (groups.includes("nurse"))  return "nurse";
  return undefined;
}

// IdToken 페이로드 → UserRole (custom:role 우선, 없으면 사번 접두사 DR/NR)
export function roleFromPayload(p: CognitoIdTokenPayload): UserRole {
  const fromGroups = roleFromGroups(p["cognito:groups"]);
  if (fromGroups) return fromGroups;
  const cr = (p["custom:role"] || "").toLowerCase();
  if (cr.includes("nurse") || cr.startsWith("nr")) return "nurse";
  if (cr.includes("doctor") || cr.startsWith("dr")) return "doctor";
  const uname = (p["cognito:username"] || p.preferred_username || "").toUpperCase();
  return uname.startsWith("NR") ? "nurse" : "doctor";
}

// ─────────────────────────────────────────────────────────────
// 4. 토큰 저장/조회 (localStorage)
//    NOTE: 프로덕션에서는 HttpOnly cookie + Backend session 권장
// ─────────────────────────────────────────────────────────────
export function saveTokens(tokens: CognitoTokens): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(tokens));
}

export function loadTokens(): CognitoTokens | null {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as CognitoTokens;
    if (t.expiresAt < Date.now()) {
      // 만료된 토큰 — 갱신 필요
      clearTokens();
      return null;
    }
    return t;
  } catch {
    return null;
  }
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

// ─────────────────────────────────────────────────────────────
// 5. fetch wrapper — 자동으로 Authorization 헤더 첨부
// ─────────────────────────────────────────────────────────────
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const tokens = loadTokens();
  const headers = new Headers(init?.headers);

  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(input, { ...init, headers });

  // 401 — 토큰 만료 또는 무효
  if (res.status === 401) {
    clearTokens();
    window.location.href = "/demo/login";
  }
  return res;
}

// ─────────────────────────────────────────────────────────────
// 6. 로그아웃 — 토큰 폐기 후 로그인 화면으로 (Hosted UI 미사용)
// ─────────────────────────────────────────────────────────────
export function signOut(): void {
  clearTokens();
  window.location.href = "/demo/login";
}
