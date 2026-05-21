// say-6 v2 — Auth Context
// 운영: Cognito JWT (cognito.ts에서 토큰 관리)
// 데모: localStorage role 저장 (Cognito 환경변수 없을 때 fallback)

import { createContext, useContext, useState, type ReactNode } from "react";
import {
  signInWithSSO,
  signOut as cognitoSignOut,
  loadTokens,
  decodeIdToken,
  roleFromGroups,
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
    const role = roleFromGroups(payload?.["cognito:groups"]);
    if (payload && role) {
      return {
        id: payload.sub,
        name: payload.name ?? payload["cognito:username"] ?? "사용자",
        role,
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

  function signIn() {
    if (isCognitoConfigured()) {
      signInWithSSO();   // Cognito Hosted UI로 redirect (페이지 이탈)
    } else {
      // 환경변수 미설정 시 — 데모 모드 안내
      console.warn("[Auth] Cognito 미설정 — LoginPage의 개발용 토글로 demoLogin() 호출 필요");
    }
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
    <AuthContext.Provider value={{ user, signIn, demoLogin, logout }}>
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
