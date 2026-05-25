import { LogOut, Moon } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { cn } from "../../lib/cn";
import { useAuth } from "../../lib/v2/auth";
import { useDarkMode } from "../../lib/v2/theme";
import {
  getAllPatients,
  isLivePatient,
  getLocalReportStatus,
} from "../../lib/v2/demoStore";
import { type ReactNode } from "react";
import { NotificationsDropdown } from "./NotificationsDropdown";

interface AppShellProps {
  /** @deprecated NotificationsDropdown이 자체 폴링하므로 더는 쓰이지 않음. 호출부 호환용. */
  notifications?: number;
  children: ReactNode;
  /** 헤더 숨김 (로그인 등) */
  bare?: boolean;
}

export function AppShell({ children, bare }: AppShellProps) {
  return (
    <div className="v2-root demo-root min-h-screen flex flex-col">
      {!bare && <Header />}
      <main className="flex-1">{children}</main>
      {!bare && <DisclaimerFooter />}
    </div>
  );
}

function DisclaimerFooter() {
  return (
    <footer className="border-t border-slate-300 bg-slate-100 dark:border-vuno-border dark:bg-vuno-surface">
      <div className="max-w-[1700px] mx-auto px-6 py-3 flex items-start gap-2">
        <span className="text-amber-600 dark:text-amber-400 text-sm leading-none mt-0.5">⚠</span>
        <p className="text-[11px] text-slate-500 dark:text-vuno-muted leading-relaxed">
          <b className="text-slate-700 dark:text-slate-200">진단 보조 시스템 안내</b> — 본 시스템의 모든 AI 분석 결과는
          의료진의 판단을 돕기 위한 <b className="text-slate-700 dark:text-slate-200">진단 보조 자료</b>이며, 의사를
          대체하지 않습니다. 환자에 대한 최종 진단 및 치료 결정은 반드시 담당 전문의의 임상적 판단과
          책임 하에 이루어져야 합니다.
        </p>
      </div>
    </footer>
  );
}

function Header() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const { logout } = useAuth();
  const { dark, toggle } = useDarkMode();

  const isTriage = pathname.startsWith("/demo/triage");
  const isDashboard = pathname.startsWith("/demo/dashboard");
  const isReports = pathname.startsWith("/demo/reports");
  // AI 분석: 환자별 AI 분석 페이지(/demo/patient/:id) — 검사 권고·오더
  const isAnalysis = /^\/demo\/patient\/[^/]+$/.test(pathname);
  // AI 결과: 환자별 검사 결과·AI 판독 페이지(/demo/patient/:id/results)
  const isResults = /^\/demo\/patient\/[^/]+\/results/.test(pathname);
  // AI 종합소견 생성: 환자별 소견서 편집 페이지(/demo/patient/:id/report)
  const isReportEdit = /^\/demo\/patient\/[^/]+\/report(?!\/view)/.test(pathname);

  function handleLogout() {
    logout();
    nav("/demo/login", { replace: true });
  }

  return (
    <header className="sticky top-0 z-30 bg-gradient-to-r from-brand-700 via-brand-600 to-ai-accent shadow-md shadow-brand-900/10">
      <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center gap-6">
        {/* 로고 */}
        <Link to="/" className="inline-flex items-center gap-3 font-bold text-white text-[26px] tracking-wide">
          <img src="/EMON.jpg" alt="EMON" className="h-11 w-11 object-contain" style={{ mixBlendMode: "screen" }} />
          <span>EMON<span className="font-extrabold"> Med</span><sup className="text-sm">®</sup></span>
        </Link>

        {/* 메뉴 */}
        <nav className="hidden md:flex items-center gap-1.5 ml-6">
          <NavLink to="/demo/triage"    label="환자정보입력" active={isTriage} />
          <NavButton
            label="AI 분석"
            active={isAnalysis}
            onClick={() => nav(pickAnalysisTarget())}
          />
          <NavButton
            label="AI 결과"
            active={isResults}
            onClick={() => nav(pickResultsTarget())}
          />
          <NavButton
            label="AI 종합소견 생성"
            active={isReportEdit}
            onClick={() => nav(pickReportTarget())}
          />
          <NavLink to="/demo/dashboard" label="운영 모니터링" active={isDashboard} />
        </nav>

        {/* 우측 — 다크모드 · Live · 알림 · 로그아웃 (오른쪽 정렬) */}
        <div className="ml-auto flex items-center gap-4">
          {/* 다크모드 토글 패널 */}
          <button
            type="button"
            onClick={toggle}
            role="switch"
            aria-checked={dark}
            title={dark ? "다크모드 ON" : "다크모드 OFF"}
            className="inline-flex items-center gap-2 h-9 pl-2.5 pr-2 rounded-lg bg-white/10 hover:bg-white/15 transition-colors"
          >
            <Moon className={cn("h-4 w-4 transition-colors", dark ? "text-white" : "text-white/70")} />
            <span className="text-sm font-semibold text-white/90 hidden lg:inline">다크</span>
            <span className={cn(
              "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
              dark ? "bg-white" : "bg-white/25",
            )}>
              <span className={cn(
                "absolute h-4 w-4 rounded-full shadow transition-transform",
                dark ? "translate-x-[18px] bg-brand-600" : "translate-x-0.5 bg-white",
              )} />
            </span>
          </button>

          <span className="inline-flex items-center gap-2 text-sm text-white/90">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-300" />
            </span>
            <span className="font-semibold tracking-wider uppercase">Live</span>
          </span>

          <NotificationsDropdown />

          <button
            onClick={handleLogout}
            className="h-10 w-10 rounded-lg hover:bg-white/10 grid place-items-center transition-colors"
            title="로그아웃"
          >
            <LogOut className="h-5 w-5 text-white/85" />
          </button>
        </div>
      </div>
    </header>
  );
}

function NavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        "h-10 px-4 text-[15px] font-semibold transition-colors flex items-center rounded-lg",
        active ? "bg-white text-brand-700 shadow-sm" : "text-white/85 hover:text-white hover:bg-white/10",
      )}
    >
      {label}
    </Link>
  );
}

function NavButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "h-10 px-4 text-[15px] font-semibold transition-colors flex items-center rounded-lg",
        active ? "bg-white text-brand-700 shadow-sm" : "text-white/85 hover:text-white hover:bg-white/10",
      )}
    >
      {label}
    </button>
  );
}

// AI 분석 탭 — 분석 중·대기 환자가 있으면 그 환자의 PatientDetail(AI 분석)로,
// 없으면 환자 목록 페이지로 폴백. live 환자는 encounter_id 쿼리 동반.
function pickAnalysisTarget(): string {
  const all = getAllPatients();
  // 우선순위: analyzing > 그 외(미완료). KTAS 낮은(중증) 환자 우선.
  const candidates = all
    .filter((p) => p.aiStatus !== "done")
    .sort((a, b) => {
      const aw = a.aiStatus === "analyzing" ? 0 : 1;
      const bw = b.aiStatus === "analyzing" ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.ktas - b.ktas;
    });
  const p = candidates[0];
  if (!p) return "/demo/triage";
  const q = isLivePatient(p.id) ? `?encounter_id=${p.id}` : "";
  return `/demo/patient/${p.id}${q}`;
}

// AI 결과 탭 — 검사 결과·AI 판독 페이지로. 분석 완료(done) 우선, 그다음 분석 중.
function pickResultsTarget(): string {
  const all = getAllPatients();
  const candidates = all
    .filter((p) => p.aiStatus === "done" || p.aiStatus === "analyzing")
    .sort((a, b) => {
      const aw = a.aiStatus === "done" ? 0 : 1;
      const bw = b.aiStatus === "done" ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.ktas - b.ktas;
    });
  const p = candidates[0] ?? all[0];
  if (!p) return "/demo/triage";
  const q = isLivePatient(p.id) ? `?encounter_id=${p.id}` : "";
  return `/demo/patient/${p.id}/results${q}`;
}

// AI 종합소견 생성 탭 — 분석 완료됐고 아직 서명 전인 환자의 소견서 편집기로.
// 우선순위: 검토 중 > 작성 가능(분석 완료) > KTAS 낮은 순. 없으면 목록으로 폴백.
function pickReportTarget(): string {
  const all = getAllPatients();
  const candidates = all
    .filter((p) => {
      if (p.aiStatus !== "done") return false;
      const local = getLocalReportStatus(p.id);
      return local !== "signed" && local !== "amended";
    })
    .sort((a, b) => {
      const aw = getLocalReportStatus(a.id) === "reviewed" ? 0 : 1;
      const bw = getLocalReportStatus(b.id) === "reviewed" ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.ktas - b.ktas;
    });
  const p = candidates[0];
  if (!p) return "/demo/reports";
  const q = isLivePatient(p.id) ? `?encounter_id=${p.id}` : "";
  return `/demo/patient/${p.id}/report${q}`;
}
