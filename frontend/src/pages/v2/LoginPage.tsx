import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AppShell } from "../../components/v2/AppShell";
import { useAuth } from "../../lib/v2/auth";

/* HAILIGHT — Light of Healthcare AI
 * Split-screen 로그인 — 좌: 사번+비밀번호 폼, 우: hero-video.mp4 + 브랜드 오버레이.
 * 데스크탑 1024px↑: 50/50 분할
 * 태블릿/모바일 1023px↓: 폼 단독, hero는 hidden */
export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { signIn, demoLogin } = useAuth();

  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectTo =
    (loc.state as { from?: string } | null)?.from || "/demo/worklist";

  const cognitoReady =
    !!import.meta.env.VITE_COGNITO_DOMAIN &&
    !!import.meta.env.VITE_COGNITO_CLIENT_ID;

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
        // Cognito 직접 SRP 로그인 (Hosted UI 안 거치고 본 페이지 그대로)
        // 실제 구현은 cognito.ts의 signInWithPassword(empId, password)
        // 일단 SSO redirect로 대체 — Pool 재생성 후 username 로직 추가
        signIn();
      } else {
        // 데모 모드 — DR로 시작하면 doctor, NR이면 nurse
        const role = empId.toUpperCase().startsWith("NR") ? "nurse" : "doctor";
        await new Promise((r) => setTimeout(r, 400));
        demoLogin(role);
        nav(redirectTo, { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인 실패");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppShell bare>
      <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-slate-50">
        {/* ─── 좌측: 로그인 폼 ─── */}
        <section className="flex items-center justify-center p-6 lg:p-12 bg-white">
          <div className="w-full max-w-md">
            {/* 헤더 */}
            <div className="mb-10">
              <h1 className="text-3xl font-bold text-slate-900">
                로그인
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                응급실 의료진 전용 진단 보조 시스템
              </p>
            </div>

            {/* 폼 */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="empId"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
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
                  placeholder="DR001"
                  className="w-full h-11 px-4 border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all disabled:bg-slate-50"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  비밀번호
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  disabled={loading}
                  className="w-full h-11 px-4 border border-slate-300 rounded-md text-slate-900 placeholder:text-slate-300 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all disabled:bg-slate-50"
                />
              </div>

              {error && (
                <p className="text-sm text-red-600 -mt-2">{error}</p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-400 text-white font-bold rounded-md transition-colors"
              >
                {loading ? "로그인 중…" : "로그인"}
              </button>

              <div className="pt-2 flex items-center justify-end gap-3 text-sm text-slate-500">
                <button type="button" className="hover:text-slate-700">
                  사번 찾기
                </button>
                <span className="text-slate-300">|</span>
                <button type="button" className="hover:text-slate-700">
                  비밀번호 찾기
                </button>
              </div>
            </form>
          </div>
        </section>

        {/* ─── 우측: hero 영상 + 브랜드 오버레이 (lg부터 노출) ─── */}
        <section className="hidden lg:block relative overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700">
          <video
            autoPlay
            muted
            loop
            playsInline
            poster="/AI.jpg"
            className="absolute inset-0 w-full h-full object-cover"
          >
            <source src="/hero-video.mp4" type="video/mp4" />
          </video>

          {/* 비디오 가장자리만 살짝 어둡게 — 중앙 뇌 디테일은 그대로 노출 */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse at center, transparent 55%, rgba(30, 27, 75, 0.35) 100%)",
            }}
          />
        </section>
      </div>
    </AppShell>
  );
}
