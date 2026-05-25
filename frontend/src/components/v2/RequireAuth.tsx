import { Navigate, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth, type UserRole } from "../../lib/v2/auth";

interface Props {
  children: ReactNode;
  /** 특정 role만 허용. 미지정 시 로그인만 확인 */
  roles?: UserRole[];
}

/**
 * 로그인 가드 — 미로그인이면 /v2/login으로 리다이렉트
 * roles 지정 시 권한 없는 사용자는 /v2/worklist로 폴백
 */
export default function RequireAuth({ children, roles }: Props) {
  const { user } = useAuth();
  const loc = useLocation();

  if (!user) {
    return <Navigate to="/demo/login" replace state={{ from: loc.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/demo/triage" replace />;
  }

  return <>{children}</>;
}
