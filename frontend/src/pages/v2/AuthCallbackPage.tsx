import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { Card } from "../../components/v2/ui/Card";
import { Button } from "../../components/v2/ui/Button";
import { exchangeCodeForTokens, decodeIdToken, roleFromGroups } from "../../lib/v2/cognito";

/**
 * Cognito Hosted UI OAuth2 콜백 처리
 * URL: /v2/auth/callback?code=xxx&state=yyy
 *
 * 1) code 추출 → token endpoint POST → idToken/accessToken 획득
 * 2) idToken 디코드 → cognito:groups에서 role 추출
 * 3) Worklist로 이동
 */
export default function AuthCallbackPage() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = params.get("code");
    const errParam = params.get("error");

    if (errParam) {
      setError(`Cognito 인증 실패: ${errParam}`);
      return;
    }
    if (!code) {
      setError("인증 코드가 없습니다.");
      return;
    }

    (async () => {
      try {
        const tokens = await exchangeCodeForTokens(code);
        const payload = decodeIdToken(tokens.idToken);
        const role = roleFromGroups(payload?.["cognito:groups"]);
        if (!role) {
          setError("사용자에게 role(doctor/nurse) 그룹이 지정되지 않았습니다.");
          return;
        }
        // 새로고침해서 AuthProvider가 토큰을 다시 로드하도록 함
        window.location.href = "/demo/triage";
      } catch (e) {
        setError(e instanceof Error ? e.message : "토큰 교환 실패");
      }
    })();
  }, [params]);

  return (
    <AppShell bare>
      <div className="min-h-screen grid place-items-center px-4 bg-slate-50">
        <Card className="w-full max-w-md p-8 text-center">
          {!error ? (
            <>
              <Loader2 className="h-10 w-10 mx-auto text-brand-600 animate-spin mb-4" />
              <h2 className="text-lg font-semibold text-slate-900">병원 SSO 인증 처리 중…</h2>
              <p className="text-sm text-slate-500 mt-1">잠시만 기다려주세요</p>
            </>
          ) : (
            <>
              <AlertCircle className="h-10 w-10 mx-auto text-critical mb-4" />
              <h2 className="text-lg font-semibold text-slate-900">인증 실패</h2>
              <p className="text-sm text-slate-600 mt-1">{error}</p>
              <Button variant="primary" className="mt-5" onClick={() => nav("/demo/login")}>
                로그인 화면으로
              </Button>
            </>
          )}
        </Card>
      </div>
    </AppShell>
  );
}
