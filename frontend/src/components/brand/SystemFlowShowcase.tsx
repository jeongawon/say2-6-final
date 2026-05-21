import { Link } from "react-router-dom";
import { BrainCircuit, Stethoscope, FileCheck2, Sparkles, Clock, ArrowRight, ArrowUpRight } from "lucide-react";
import { Reveal } from "./anim/Reveal";

/**
 * EMON System Flow — 3단 (좌·중앙·우)
 *
 * Stage 01: 간호사 트리아지 (자동입력 애니메이션)
 * Stage 02: Multi-Modal AI — AI 중앙 + 3 모달 비디오 둘러싸기
 * Stage 03: 종합 소견서 생성 + 의사 검토 (타이핑 애니메이션)
 *
 * 비디오 URL (수정하려면 아래 상수만 변경):
 */
// ECG: VUNO DeepCARS (심전도 영역)
const VIMEO_ECG = "https://player.vimeo.com/video/651450767?muted=1&controls=0&loop=1&background=1&autoplay=1&app_id=122963";
// CXR: VUNO Chest Clean
const VIMEO_CXR = "https://player.vimeo.com/video/484308155?muted=1&controls=0&loop=1&background=1&autoplay=1&app_id=122963";
// LAB: 로컬 mp4 (public/lab.mp4) — 6h 예측 + 룰기반 표

export function SystemFlowShowcase() {
  return (
    <section className="py-28 bg-vuno-bg border-t border-vuno-divider relative overflow-hidden">
      {/* 배경 글로우 */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[600px] bg-vuno-cyan/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-[1600px] mx-auto px-6">
        {/* 헤더 */}
        <Reveal className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-12 mb-16">
          <div>
            <div className="text-xs font-bold text-vuno-cyan tracking-[0.25em] uppercase mb-4">
              Products · System Flow
            </div>
            <h2 className="text-5xl md:text-6xl font-bold text-white leading-[1.1] tracking-tight">
              Products
            </h2>
          </div>
          <div className="flex items-end">
            <p className="text-lg md:text-xl text-vuno-muted leading-relaxed max-w-2xl">
              간호사 트리아지부터 의사 서명까지, AI가 ECG·CXR·LAB을 동시 분석하고
              유사 사례를 검색해 1차 소견서를 자동 생성합니다.
              <span className="text-white font-semibold"> 진단 의사결정 시간 40% 단축.</span>
            </p>
          </div>
        </Reveal>

        {/* 3단 흐름도 */}
        {/* 가운데 AI는 모달 3개가 둘러쌀 넓은 공간 필요, 양옆은 적절히 축소 */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.6fr_1fr] gap-6 items-stretch">
          <Reveal>
            <Stage01TriageForm />
          </Reveal>
          <Reveal delay={250}>
            <Stage02MultiModalAI />
          </Reveal>
          <Reveal delay={500}>
            <Stage03Report />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────
   공통 헤더
   ───────────────────────────────────────────────────────── */
function StageHeader({ num, label, sub, highlight }: { num: string; label: string; sub: string; highlight?: boolean }) {
  return (
    <div className="text-center mb-5">
      <div className={
        "inline-flex items-center gap-2 px-3 py-1 border " +
        (highlight ? "border-vuno-cyan bg-vuno-cyan/10" : "border-vuno-border bg-vuno-surface")
      }>
        <span className={"text-xs font-bold font-numeric tracking-[0.2em] " + (highlight ? "text-vuno-cyan" : "text-vuno-muted")}>
          STAGE {num}
        </span>
      </div>
      <h3 className={"text-xl md:text-2xl font-bold mt-3 " + (highlight ? "text-vuno-cyan" : "text-white")}>
        {label}
      </h3>
      <div className="text-xs text-vuno-muted mt-1 tracking-wider uppercase">{sub}</div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
   STAGE 01 — 간호사 트리아지 (영상 배경 + EMR 데이터 오버레이)
   ═════════════════════════════════════════════════════════ */
function Stage01TriageForm() {
  return (
    <div className="h-full flex flex-col">
      <StageHeader num="01" label="Patient" sub="환자 정보 입력" />

      <div className="flex-1 border border-vuno-border bg-vuno-surface/40 overflow-hidden flex flex-col">
        {/* EMR 액션 바 */}
        <div className="bg-vuno-bg border-b border-vuno-border px-3 py-2 flex items-center gap-2 z-10">
          <Stethoscope className="h-3.5 w-3.5 text-emerald-400" />
          <span className="text-[10px] font-bold text-emerald-400 tracking-[0.15em] uppercase">Triage Workstation</span>
          <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        {/* 영상 배경 + EMR 데이터 오버레이 */}
        <div className="relative flex-1 min-h-[420px] overflow-hidden">
          {/* 간호사 타이핑 영상 (배경) */}
          <video
            src="/triage-video.mp4"
            autoPlay
            muted
            loop
            playsInline
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* 다크 그라데이션 오버레이 (데이터 가독성) */}
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(15,23,42,0.5) 0%, rgba(15,23,42,0.85) 60%, rgba(15,23,42,0.97) 100%)",
            }}
          />

          {/* EMR 데이터 오버레이 카드 */}
          <div className="absolute inset-x-0 bottom-0 p-3 space-y-2">
            {/* 환자 메타 */}
            <div className="flex items-center gap-2.5 text-[10px] pb-1.5 border-b border-vuno-border/60">
              <MetaItem label="MRN" value="12345678" delay="0.3s" />
              <MetaItem label="NAME" value="김OO" delay="0.6s" />
              <span className="text-vuno-muted opacity-0" style={{ animation: "fade-in 0.3s ease-out 0.9s forwards" }}>M/52</span>
            </div>

            {/* Vital Signs */}
            <div className="grid grid-cols-3 gap-1.5">
              <EmrCell label="HR"   value="88"     delay="1.2s" />
              <EmrCell label="BP"   value="140/90" delay="1.4s" />
              <EmrCell label="SpO₂" value="94%"    delay="1.6s" abnormal />
            </div>

            {/* KTAS + 주증상 한 줄 */}
            <div className="grid grid-cols-[auto_1fr] gap-1.5">
              <div
                className="grid place-items-center px-2.5 bg-red-600 text-white text-[11px] font-bold opacity-0"
                style={{ animation: "fade-in 0.3s ease-out 2.0s forwards" }}
              >
                KTAS-2
              </div>
              <div
                className="bg-vuno-bg/90 border border-vuno-border px-2 py-1.5 overflow-hidden opacity-0"
                style={{ animation: "fade-in 0.3s ease-out 2.3s forwards" }}
              >
                <div
                  className="text-[11px] text-white whitespace-nowrap overflow-hidden"
                  style={{ animation: "type-in 1.4s steps(30, end) 2.5s both", borderRight: "2px solid #2DD4BF" }}
                >
                  흉통, 호흡곤란 30분 전 발생
                </div>
              </div>
            </div>

            {/* Past History */}
            <div className="flex flex-wrap gap-1">
              {[
                { code: "HTN", on: true,  d: "4.2s" },
                { code: "DM",  on: true,  d: "4.3s" },
                { code: "CAD", on: false, d: "4.4s" },
                { code: "CVA", on: false, d: "4.5s" },
              ].map((h) => (
                <div
                  key={h.code}
                  className={
                    "inline-flex items-center gap-1 h-5 px-1.5 text-[9px] font-bold border opacity-0 " +
                    (h.on ? "bg-vuno-cyan/15 border-vuno-cyan text-vuno-cyan" : "bg-vuno-bg/80 border-vuno-border text-vuno-muted")
                  }
                  style={{ animation: `fade-in 0.3s ease-out ${h.d} forwards` }}
                >
                  {h.on ? "☑" : "☐"} {h.code}
                </div>
              ))}
            </div>

            {/* 등록 완료 */}
            <div className="opacity-0" style={{ animation: "fade-in 0.5s ease-out 5.2s forwards" }}>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/20 border border-emerald-500 text-[10px] font-bold text-emerald-400 tracking-wider uppercase">
                ✓ Submit + AI 분석 시작
              </div>
            </div>
          </div>
        </div>

        {/* 하단 — Live Demo 링크 */}
        <Link
          to="/demo/triage"
          className="block border-t border-vuno-border bg-vuno-bg hover:bg-vuno-elevated px-3 py-2 text-[10px] font-bold text-vuno-cyan tracking-wider uppercase transition-colors group z-10"
        >
          <span className="inline-flex items-center justify-between w-full">
            <span>실제 트리아지 페이지 보기</span>
            <ArrowUpRight className="h-3 w-3 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </Link>

        <style>{`
          @keyframes type-in {
            0%   { width: 0; opacity: 0; }
            10%  { opacity: 1; }
            100% { width: 100%; opacity: 1; }
          }
          @keyframes fade-in {
            from { opacity: 0; transform: translateY(4px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>

      <FlowArrow color="emerald" />
    </div>
  );
}

/* 상단 환자 메타 셀 */
function MetaItem({ label, value, delay }: { label: string; value: string; delay: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1 opacity-0"
      style={{ animation: `fade-in 0.3s ease-out ${delay} forwards` }}
    >
      <span className="text-vuno-muted text-[9px] uppercase tracking-wider">{label}</span>
      <span className="text-white font-bold font-numeric tabular-nums">{value}</span>
    </span>
  );
}

/* EMR 셀 (단일 라벨 + 값) */
function EmrCell({ label, value, delay, abnormal }: { label: string; value: string; delay: string; abnormal?: boolean }) {
  return (
    <div
      className="bg-vuno-bg/90 backdrop-blur-sm border border-vuno-border px-1.5 py-1 opacity-0"
      style={{ animation: `fade-in 0.3s ease-out ${delay} forwards` }}
    >
      <div className="text-[8px] text-vuno-muted uppercase tracking-wider">{label}</div>
      <div className={"text-[11px] font-bold font-numeric " + (abnormal ? "text-red-400" : "text-white")}>
        {value}{abnormal && " ↓"}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
   STAGE 02 — AI 중앙 + 3 모달 둘러싸기 (가운데, 가장 큼)
   ═════════════════════════════════════════════════════════ */
function Stage02MultiModalAI() {
  return (
    <div className="h-full flex flex-col">
      <StageHeader num="02" label="Multi-Modal AI" sub="AI 통합 분석" highlight />

      <div className="flex-1 relative p-6 bg-gradient-to-b from-vuno-cyan/5 to-transparent shadow-[0_0_60px_-15px_rgba(45,212,191,0.5)] min-h-[560px]">
        {/* 도트 그리드 배경 */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none"
          style={{
            backgroundImage: "radial-gradient(circle, rgba(45,212,191,0.6) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />

        {/* 회전 점선 링 (배경) */}
        <div className="absolute inset-[15%] rounded-full border-2 border-dashed border-vuno-cyan/25 pointer-events-none"
          style={{ animation: "rotate-slow 35s linear infinite" }} />
        <div className="absolute inset-[25%] rounded-full border border-dashed border-vuno-cyan/15 pointer-events-none"
          style={{ animation: "rotate-slow-rev 25s linear infinite" }} />

        {/* 위치별 모달 박스들 + 중앙 AI */}
        <div className="relative h-full grid place-items-center min-h-[500px]">
          {/* ECG — 12시 (위) · DeepCARS 비디오 */}
          <ModalVideoBox
            position="absolute top-2 left-1/2 -translate-x-1/2"
            label="ECG"
            sub="심전도 12-Lead"
            tone="red"
            videoUrl={VIMEO_ECG}
          />

          {/* CXR — 5시 (우하) · 흉부 X-ray 비디오 */}
          <ModalVideoBox
            position="absolute bottom-4 right-2"
            label="CXR"
            sub="흉부 X-ray"
            tone="sky"
            videoUrl={VIMEO_CXR}
          />

          {/* LAB — 7시 (좌하) · 로컬 mp4 비디오 (6h 예측) */}
          <ModalLabVideo position="absolute bottom-4 left-2" />

          {/* 중앙 AI 원 */}
          <AICenterBubble />

          {/* 가운데로 향하는 연결선 SVG */}
          <ConnectorLines />
        </div>

        <style>{`
          @keyframes rotate-slow {
            from { transform: rotate(0deg); }
            to   { transform: rotate(360deg); }
          }
          @keyframes rotate-slow-rev {
            from { transform: rotate(360deg); }
            to   { transform: rotate(0deg); }
          }
        `}</style>
      </div>

      <FlowArrow color="cyan" />
    </div>
  );
}

function AICenterBubble() {
  return (
    <div className="relative z-30">
      <div className="absolute -inset-6 bg-vuno-cyan/40 rounded-full blur-2xl animate-pulse" />
      <div className="relative h-[150px] w-[150px] md:h-[170px] md:w-[170px] rounded-full bg-vuno-bg border-2 border-vuno-cyan shadow-[0_0_50px_rgba(45,212,191,0.7)] grid place-items-center">
        <div className="text-center">
          <BrainCircuit className="h-12 w-12 md:h-14 md:w-14 mx-auto text-white mb-1"
            style={{ filter: "drop-shadow(0 0 10px rgba(45,212,191,0.9))" }} strokeWidth={1.5} />
          <div className="text-3xl md:text-4xl font-bold text-white tracking-[0.15em] font-numeric leading-none"
            style={{ textShadow: "0 0 14px rgba(45,212,191,0.95)" }}>AI</div>
          <div className="text-[9px] text-vuno-cyan tracking-[0.25em] uppercase mt-1.5">Multi-Modal</div>
        </div>
      </div>
    </div>
  );
}

function ConnectorLines() {
  return (
    <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full pointer-events-none z-10" preserveAspectRatio="none">
      <defs>
        <linearGradient id="cn-ecg" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stopColor="#F87171" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#F87171" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#F87171" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="cn-cxr" x1="100%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#38BDF8" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.1" />
        </linearGradient>
        <linearGradient id="cn-lab" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#34D399" stopOpacity="0.1" />
          <stop offset="50%" stopColor="#34D399" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#34D399" stopOpacity="0.1" />
        </linearGradient>
      </defs>
      {/* ECG (위 → 중앙) */}
      <line x1="50" y1="15" x2="50" y2="40" stroke="url(#cn-ecg)" strokeWidth="0.5" />
      {/* CXR (우하 → 중앙) */}
      <line x1="85" y1="85" x2="60" y2="60" stroke="url(#cn-cxr)" strokeWidth="0.5" />
      {/* LAB (좌하 → 중앙) */}
      <line x1="15" y1="85" x2="40" y2="60" stroke="url(#cn-lab)" strokeWidth="0.5" />
      {/* 흐르는 펄스 점 */}
      <circle r="1" fill="#F87171" filter="drop-shadow(0 0 3px #F87171)">
        <animateMotion dur="2s" repeatCount="indefinite" path="M 50,15 L 50,40" />
      </circle>
      <circle r="1" fill="#38BDF8" filter="drop-shadow(0 0 3px #38BDF8)">
        <animateMotion dur="2.4s" repeatCount="indefinite" path="M 85,85 L 60,60" />
      </circle>
      <circle r="1" fill="#34D399" filter="drop-shadow(0 0 3px #34D399)">
        <animateMotion dur="2.2s" repeatCount="indefinite" path="M 15,85 L 40,60" />
      </circle>
    </svg>
  );
}

// 모든 모달이 비디오의 파란/네이비 톤과 어우러지게 sky 계열로 통일
const TONE_MAP = {
  red:   { border: "border-sky-400/70", text: "text-sky-300", dot: "bg-sky-300" },
  sky:   { border: "border-sky-400/70", text: "text-sky-400", dot: "bg-sky-400" },
  green: { border: "border-sky-400/70", text: "text-sky-500", dot: "bg-sky-500" },
};

function ModalVideoBox({
  position, label, sub, tone, videoUrl,
}: {
  position: string;
  label: string;
  sub: string;
  tone: keyof typeof TONE_MAP;
  videoUrl: string;
}) {
  const t = TONE_MAP[tone];
  return (
    <div className={`${position} z-20 w-[150px] md:w-[170px]`}>
      <div className={`relative h-[120px] md:h-[140px] border-2 ${t.border} bg-[#081427] overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]`}>
        {/* Vimeo iframe — 박스 cover (iframe 200% 확대 + 가운데 정렬 + overflow:hidden) */}
        <iframe
          src={videoUrl}
          title={label}
          allow="autoplay; fullscreen; picture-in-picture"
          className="absolute pointer-events-none"
          style={{
            top: "50%",
            left: "50%",
            width: "200%",
            height: "200%",
            transform: "translate(-50%, -50%)",
            border: 0,
          }}
        />
        {/* Live dot */}
        <span className={`absolute top-2 right-2 z-10 flex h-2 w-2`}>
          <span className={`absolute inline-flex h-full w-full rounded-full ${t.dot} opacity-75 animate-ping`} />
          <span className={`relative inline-flex h-2 w-2 rounded-full ${t.dot}`} />
        </span>
        {/* 라벨 */}
        <div className="absolute top-2 left-2 z-10">
          <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 bg-vuno-bg/90 backdrop-blur border ${t.border}`}>
            <span className={`text-[10px] font-bold tracking-[0.15em] ${t.text}`}>{label}</span>
          </div>
        </div>
        {/* 하단 */}
        <div className="absolute bottom-0 inset-x-0 px-2 py-1 bg-vuno-bg/90 backdrop-blur border-t border-vuno-border">
          <div className="text-[9px] text-white tracking-wider uppercase">{sub}</div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   LAB — 로컬 mp4 비디오 (다른 모달 비디오 박스와 동일 외형)
   ───────────────────────────────────────────────────────── */
function ModalLabVideo({ position }: { position: string }) {
  return (
    <div className={`${position} z-20 w-[150px] md:w-[170px]`}>
      <div className="relative h-[120px] md:h-[140px] border-2 border-sky-400/70 bg-[#081427] overflow-hidden shadow-[0_10px_30px_-10px_rgba(0,0,0,0.7)]">
        {/* 로컬 mp4 — 박스 가득 cover */}
        <video
          src="/lab.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Live dot */}
        <span className="absolute top-2 right-2 z-10 flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-sky-400" />
        </span>

        {/* 상단 라벨 */}
        <div className="absolute top-2 left-2 z-10">
          <div className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-vuno-bg/90 backdrop-blur border border-sky-400/70">
            <span className="text-[10px] font-bold tracking-[0.15em] text-sky-400">LAB</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
   STAGE 03 — AI 소견서 자동작성 (흰색 소견서 양식 + 타이핑)
   ═════════════════════════════════════════════════════════ */
function Stage03Report() {
  return (
    <div className="h-full flex flex-col">
      <StageHeader num="03" label="Outcome" sub="AI 소견서 · 의사 검토" />

      <div className="flex-1 border border-vuno-border bg-vuno-surface/40 overflow-hidden flex flex-col">
        {/* EMR 액션 바 */}
        <div className="bg-vuno-bg border-b border-vuno-border px-3 py-2 flex items-center gap-2 z-10">
          <Sparkles className="h-3.5 w-3.5 text-vuno-cyan" />
          <span className="text-[10px] font-bold text-vuno-cyan tracking-[0.15em] uppercase">AI 종합 소견서</span>
          <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-vuno-cyan animate-pulse" />
        </div>

        {/* 소견서 작성 영역 — 다크 배경 위 흰 종이 */}
        <div className="relative flex-1 min-h-[420px] overflow-hidden p-3 grid place-items-center">
          {/* 배경 글로우 */}
          <div className="absolute inset-0 bg-vuno-cyan/5" />

          {/* 흰색 소견서 카드 (종이) */}
          <div
            className="relative w-full bg-white shadow-[0_8px_30px_-4px_rgba(0,0,0,0.5)] opacity-0"
            style={{ animation: "report-rise 0.6s cubic-bezier(0.16,1,0.3,1) 0.1s forwards" }}
          >
            {/* 제목 */}
            <div className="text-center pt-3 pb-2 border-b-2 border-slate-800">
              <div className="text-base font-bold text-slate-900 tracking-[0.4em]">소 견 서</div>
              <div className="text-[8px] text-red-600 mt-0.5 tracking-wider">[ 원본대조필인 (印) ]</div>
            </div>

            {/* 표 — 환자 정보 */}
            <table className="w-full text-[9px] border-collapse">
              <tbody>
                <ReportFormRow label="차트번호" value="19041043" delay="0.6s" />
                <ReportFormRow label="환자 성명" value="원OO  ·  M  ·  만 30세" delay="1.0s" />
                <ReportFormRow label="병      명" value="신규 발현 심방세동 (NEW A-fib)" delay="1.5s" highlight />
                <ReportFormRow label="발 병 일" value="2026-04-29  (발병 90분)" delay="2.0s" />
              </tbody>
            </table>

            {/* 향후 치료 의견 */}
            <div className="px-2.5 py-2 border-t border-slate-300">
              <div
                className="text-[8px] font-bold text-slate-700 mb-1 opacity-0"
                style={{ animation: "fade-in 0.3s ease-out 2.4s forwards" }}
              >
                [ 진단 요약 ]
              </div>
              <TypingLine
                text="ECG 심방세동 61% · HR 114 빈맥 · 율동전환 평가 필요"
                delay="2.6s"
                className="text-[8.5px] text-slate-800"
              />
              <div
                className="text-[8px] font-bold text-slate-700 mt-1.5 mb-1 opacity-0"
                style={{ animation: "fade-in 0.3s ease-out 3.8s forwards" }}
              >
                [ 향후 치료 권고 ]
              </div>
              <TypingLine text="① 12유도 ECG 재시행 · 판독 확인" delay="4.0s" className="text-[8.5px] text-slate-800" />
              <TypingLine text="② 항응고 평가 — CHA₂DS₂-VASc 산정" delay="4.9s" className="text-[8.5px] text-slate-800" />
              <TypingLine text="③ 심박수 조절 — Metoprolol IV 고려" delay="5.8s" className="text-[8.5px] text-slate-800" />
            </div>

            {/* 비고 */}
            <div
              className="px-2.5 py-1.5 border-t border-slate-300 flex items-center gap-2 opacity-0"
              style={{ animation: "fade-in 0.4s ease-out 6.6s forwards" }}
            >
              <span className="text-[8px] font-bold text-slate-700">비고</span>
              <span className="text-[8px] text-slate-600">Risk: URGENT · AI 보조 분석 · RAG 사례 3건</span>
            </div>

            {/* 하단 — 발행일 + 의사 서명 + 도장 */}
            <div className="px-2.5 py-2 border-t-2 border-slate-800 flex items-center justify-between">
              <div
                className="text-[8px] text-slate-600 opacity-0"
                style={{ animation: "fade-in 0.3s ease-out 7.0s forwards" }}
              >
                발행일 2026-04-29
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="text-[8px] text-slate-700 opacity-0"
                  style={{ animation: "fade-in 0.3s ease-out 7.0s forwards" }}
                >
                  의사성명 정OO
                </span>
                {/* 도장 — pop-in */}
                <span
                  className="inline-grid place-items-center h-5 w-5 rounded-full border-2 border-red-600 text-red-600 text-[7px] font-bold opacity-0"
                  style={{ animation: "stamp-pop 0.5s cubic-bezier(0.34,1.56,0.64,1) 7.4s forwards" }}
                >
                  印
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes report-rise {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes stamp-pop {
          0%   { opacity: 0; transform: scale(2) rotate(-25deg); }
          60%  { opacity: 1; transform: scale(0.9) rotate(8deg); }
          100% { opacity: 1; transform: scale(1) rotate(-12deg); }
        }
      `}</style>
    </div>
  );
}

/* 소견서 표 행 — 라벨 + 값 (값은 페이드인) */
function ReportFormRow({ label, value, delay, highlight }: { label: string; value: string; delay: string; highlight?: boolean }) {
  return (
    <tr className="border-b border-slate-300">
      <td className="w-[64px] px-2 py-1.5 bg-slate-100 font-bold text-slate-700 text-center align-middle border-r border-slate-300">
        {label}
      </td>
      <td className="px-2 py-1.5 align-middle">
        <span
          className={"opacity-0 inline-block " + (highlight ? "font-bold text-red-700" : "text-slate-800")}
          style={{ animation: `fade-in 0.4s ease-out ${delay} forwards` }}
        >
          {value}
        </span>
      </td>
    </tr>
  );
}

/* 타이핑 라인 (좌→우 타이핑 효과) */
function TypingLine({ text, delay, className }: { text: string; delay: string; className?: string }) {
  return (
    <div className="overflow-hidden">
      <div
        className={"whitespace-nowrap overflow-hidden leading-relaxed " + (className ?? "")}
        style={{
          animation: `type-in 0.9s steps(36, end) ${delay} both`,
          borderRight: "1px solid #1E293B",
        }}
      >
        {text}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   화살표 (각 Stage 끝)
   ───────────────────────────────────────────────────────── */
function FlowArrow({ color }: { color: "emerald" | "cyan" }) {
  const colorClass = color === "emerald" ? "text-emerald-400" : "text-vuno-cyan";
  return (
    <div className={`flex items-center justify-center mt-4 ${colorClass}`}>
      <ArrowRight className="h-5 w-5 animate-pulse hidden lg:block" />
      <ArrowRight className="h-5 w-5 rotate-90 lg:hidden" />
    </div>
  );
}
