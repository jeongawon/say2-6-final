import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "../../components/v2/AppShell";
import { useAuth } from "../../lib/v2/auth";

/* EMON Med® — Emergency Multi-modal Orchestrated Network
 * Split-screen 로그인 — 좌: 아이디+비밀번호 폼, 우: 브레인 + HUD 브랜드 히어로(정적 이미지). */
export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { loginWithPassword, submitNewPassword, demoLogin } = useAuth();

  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 첫 로그인 — 임시 비밀번호 → 새 비밀번호 설정
  const [needNewPassword, setNeedNewPassword] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  const redirectTo =
    (loc.state as { from?: string } | null)?.from || "/demo/triage";

  const cognitoReady =
    !!import.meta.env.VITE_COGNITO_CLIENT_ID &&
    !!(import.meta.env.VITE_COGNITO_REGION || import.meta.env.VITE_COGNITO_USER_POOL_ID);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!empId.trim() || !password) {
      setError("사번과 비밀번호를 입력하세요.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      if (cognitoReady) {
        const result = await loginWithPassword(empId, password);
        if (result === "new_password") {
          setNeedNewPassword(true);
        } else {
          nav(redirectTo, { replace: true });
        }
      } else {
        // Cognito 미설정 시 — 데모 모드 (사번 접두사로 역할 추정)
        const role = empId.toUpperCase().startsWith("NR") ? "nurse" : "doctor";
        await new Promise((r) => setTimeout(r, 300));
        demoLogin(role);
        nav(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleNewPassword(e: FormEvent) {
    e.preventDefault();
    if (newPw.length < 8) { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (newPw !== newPw2) { setError("새 비밀번호가 일치하지 않습니다."); return; }
    setError(null);
    setLoading(true);
    try {
      await submitNewPassword(newPw);
      nav(redirectTo, { replace: true });
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell bare>
      <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-white">
        {/* ─── 좌측: 로그인 폼 (전체 가운데 정렬) ─── */}
        <section className="min-h-screen flex items-center justify-center px-12 sm:px-16 bg-white">
          <div className="w-full max-w-[420px] flex flex-col">
            {/* 브랜드명 — 가운데 (조금 위로) */}
            <Wordmark className="text-slate-900 self-center mb-24" />
            <h1 className="text-[40px] leading-none font-bold text-slate-900 mb-10">Login</h1>

            {needNewPassword ? (
              <form onSubmit={handleNewPassword} className="space-y-5">
                <p className="text-[15px] text-slate-500 -mt-4 leading-relaxed">최초 로그인입니다. 사용할 새 비밀번호를 설정해 주세요.</p>
                <div>
                  <label htmlFor="newPw" className="block text-[15px] font-bold text-slate-800 mb-2">새 비밀번호</label>
                  <input
                    id="newPw" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)}
                    autoFocus disabled={loading} autoComplete="new-password" placeholder="8자 이상 · 대/소문자·숫자·특수문자"
                    className="w-full h-14 px-4 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all disabled:bg-slate-50"
                  />
                </div>
                <div>
                  <label htmlFor="newPw2" className="block text-[15px] font-bold text-slate-800 mb-2">새 비밀번호 확인</label>
                  <input
                    id="newPw2" type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)}
                    disabled={loading} autoComplete="new-password"
                    className="w-full h-14 px-4 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all disabled:bg-slate-50"
                  />
                </div>
                {error && <p className="text-sm text-red-600 -mt-2">{error}</p>}
                <button type="submit" disabled={loading} className="w-full h-14 mt-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-[17px] font-bold rounded-lg transition-colors">
                  {loading ? "설정 중…" : "비밀번호 설정 후 로그인"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="empId" className="block text-[15px] font-bold text-slate-800 mb-2">
                    사번
                  </label>
                  <input
                    id="empId"
                    type="text"
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    autoComplete="username"
                    autoFocus
                    disabled={loading}
                    placeholder="예: DR001 / NR001"
                    className="w-full h-14 px-4 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label htmlFor="password" className="block text-[15px] font-bold text-slate-800 mb-2">
                    비밀번호
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    disabled={loading}
                    className="w-full h-14 px-4 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all disabled:bg-slate-50"
                  />
                </div>

                {error && <p className="text-sm text-red-600 -mt-2">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 mt-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white text-[17px] font-bold rounded-lg transition-colors"
                >
                  {loading ? "로그인 중…" : "로그인"}
                </button>

                <p className="pt-2 text-center text-[14px] text-slate-500">계정·비밀번호 발급은 관리자에게 문의하세요.</p>
              </form>
            )}
          </div>
        </section>

        {/* ─── 우측: 브레인 배경 + EMON 아이콘 (lg부터) ─── */}
        <section className="hidden lg:flex relative overflow-hidden items-center justify-center bg-gradient-to-br from-blue-700 via-indigo-700 to-violet-700">
          {/* 브레인 배경 (정적) */}
          <img
            src="/AI.jpg"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-90"
          />
          {/* 인디고 틴트 (앱 히어로와 동일한 브랜드 톤) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "linear-gradient(to bottom, rgba(55,48,163,0.4) 0%, rgba(55,48,163,0) 55%)" }}
          />
          {/* 가장자리 비네팅 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 45%, rgba(30,27,75,0.5) 100%)" }}
          />

          {/* 중앙 — 브레인 속 'AI' 박스 가리기 + EMON 아이콘 (그리드 스택으로 정중앙 강제) */}
          <div className="relative grid place-items-center">
            {/* 글로우 */}
            <div className="[grid-area:1/1] h-80 w-80 rounded-full bg-indigo-300/15 blur-3xl" />
            {/* 'AI' 박스 마스킹 — 정중앙, 불투명 브레인 톤 + 블러 */}
            <div className="[grid-area:1/1] h-44 w-72 rounded-full blur-2xl" style={{ background: "rgb(26,52,104)" }} />
            {/* EMON 아이콘 — 정중앙 */}
            <img
              src="/EMON.jpg"
              alt="EMON"
              className="[grid-area:1/1] w-56 object-contain"
              style={{ mixBlendMode: "screen" }}
            />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/* Cognito 에러 코드 → 사용자 메시지 (사번 로그인 기준) */
function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  switch (code) {
    case "NotAuthorizedException":
    case "UserNotFoundException":
      return "사번 또는 비밀번호가 틀렸습니다.";
    case "PasswordResetRequiredException":
      return "비밀번호 재설정이 필요합니다. 관리자에게 문의하세요.";
    case "InvalidPasswordException":
      return "비밀번호 정책을 만족하지 않습니다 (대/소문자·숫자·특수문자 포함 8자 이상).";
    case "UserNotConfirmedException":
      return "계정이 활성화되지 않았습니다. 관리자에게 문의하세요.";
    case "TooManyRequestsException":
    case "LimitExceededException":
      return "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.";
    default:
      return err instanceof Error && err.message ? err.message : "로그인에 실패했습니다.";
  }
}

/* EMON Med® 워드마크 — 레터스페이스 텍스트(+다크 배경에선 로고 아이콘) */
function Wordmark({ className = "", icon = false }: { className?: string; icon?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-3 text-[52px] font-extrabold tracking-[0.08em] ${className}`}>
      {icon && <img src="/EMON.jpg" alt="" className="h-14 w-14 object-contain" style={{ mixBlendMode: "screen" }} />}
      <span>EMON Med<sup className="text-[22px] align-super">®</sup></span>
    </span>
  );
}
