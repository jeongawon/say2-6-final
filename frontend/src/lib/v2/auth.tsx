// say-6 v2 — Auth Context
// 운영: Cognito JWT (cognito.ts에서 토큰 관리)
// 데모: localStorage role 저장 (Cognito 환경변수 없을 때 fallback)

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import {
  signInWithSSO,
  signInWithPassword,
  completeNewPassword as cognitoCompleteNewPassword,
  signOut as cognitoSignOut,
  loadTokens,
  decodeIdToken,
  roleFromPayload,
  type CognitoTokens,
  clearTokens,
} from "./cognito";

export type UserRole = "nurse" | "doctor";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email?: string;
  /** Cognito JWT의 idToken (백엔드 호출 시 검증용 — 실제로는 accessToken을 보냄) */
  idToken?: string;
}

interface AuthContextValue {
  user: User | null;
  /** 운영: Cognito Hosted UI로 redirect / 데모: 즉시 로그인 */
  signIn: () => void;
  /** 사번 + 비밀번호 직접 로그인 (USER_PASSWORD_AUTH). "new_password" = 첫 로그인 비번 변경 필요 */
  loginWithPassword: (empId: string, password: string) => Promise<"ok" | "new_password">;
  /** 첫 로그인 — 임시 비밀번호 → 새 비밀번호로 변경 후 로그인 완료 */
  submitNewPassword: (newPassword: string) => Promise<void>;
  /** 데모 전용 — 역할 지정 로그인 (운영 코드에서는 호출 금지) */
  demoLogin: (role: UserRole) => void;
  logout: () => void;
}

const DEMO_STORAGE_KEY = "say6_v2_demo_user";

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const DEMO_USERS: Record<UserRole, User> = {
  doctor: { id: "u-001", name: "김의사",   role: "doctor", email: "doctor@say-6.demo" },
  nurse:  { id: "u-002", name: "박간호사", role: "nurse",  email: "nurse@say-6.demo"  },
};

/** Cognito 환경변수 설정 여부 */
function isCognitoConfigured(): boolean {
  return !!import.meta.env.VITE_COGNITO_DOMAIN
      && !!import.meta.env.VITE_COGNITO_CLIENT_ID;
}

/** 초기 사용자 복원 — Cognito 토큰 → 데모 유저 순.
 *  렌더 전(동기) 실행해야 새로고침 시 RequireAuth가 로그인으로 튕기지 않음. */
function restoreUser(): User | null {
  // 1) Cognito 토큰 확인
  const tokens = loadTokens();
  if (tokens?.idToken) {
    const payload = decodeIdToken(tokens.idToken);
    if (payload) {
      return {
        id: payload.sub,
        name: payload.name ?? payload["cognito:username"] ?? "사용자",
        role: roleFromPayload(payload),
        email: payload.email,
        idToken: tokens.idToken,
      };
    }
  }
  // 2) 데모 사용자 fallback
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as User;
  } catch { /* 무시 */ }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // 동기 초기화 — 첫 렌더부터 로그인 상태 유지 (새로고침해도 현재 페이지 유지)
  const [user, setUser] = useState<User | null>(() => restoreUser());
  // 첫 로그인(NEW_PASSWORD_REQUIRED) 챌린지 보관
  const challengeRef = useRef<{ session: string; username: string } | null>(null);

  function applyTokens(tokens: CognitoTokens) {
    const payload = decodeIdToken(tokens.idToken);
    if (!payload) throw new Error("토큰 해석 실패");
    setUser({
      id: payload.sub,
      name: payload.name ?? payload["cognito:username"] ?? "사용자",
      role: roleFromPayload(payload),
      email: payload.email,
      idToken: tokens.idToken,
    });
    localStorage.removeItem(DEMO_STORAGE_KEY);
  }

  function signIn() {
    if (isCognitoConfigured()) {
      signInWithSSO();   // (구) Hosted UI redirect — 현재 로그인은 loginWithPassword 사용
    } else {
      console.warn("[Auth] Cognito 미설정 — 데모 모드");
    }
  }

  // 사번 + 비밀번호 직접 로그인
  async function loginWithPassword(empId: string, password: string): Promise<"ok" | "new_password"> {
    const result = await signInWithPassword(empId.trim(), password);
    if (result.status === "new_password_required") {
      challengeRef.current = { session: result.session, username: result.username };
      return "new_password";
    }
    applyTokens(result.tokens);
    return "ok";
  }

  async function submitNewPassword(newPassword: string): Promise<void> {
    const ch = challengeRef.current;
    if (!ch) throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
    const tokens = await cognitoCompleteNewPassword(ch.username, newPassword, ch.session);
    challengeRef.current = null;
    applyTokens(tokens);
  }

  function demoLogin(role: UserRole) {
    const u = DEMO_USERS[role];
    setUser(u);
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(u));
  }

  function logout() {
    setUser(null);
    localStorage.removeItem(DEMO_STORAGE_KEY);
    clearTokens();
    if (isCognitoConfigured()) {
      cognitoSignOut();   // Cognito 세션도 종료 (페이지 이탈)
    }
  }

  return (
    <AuthContext.Provider value={{ user, signIn, loginWithPassword, submitNewPassword, demoLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

// 권한 헬퍼
export function canSign(role?: UserRole): boolean       { return role === "doctor"; }
export function canApproveAI(role?: UserRole): boolean   { return role === "doctor"; }
export function canEditReport(role?: UserRole): boolean  { return role === "doctor"; }
export function canTriage(role?: UserRole): boolean      { return role === "nurse" || role === "doctor"; }
