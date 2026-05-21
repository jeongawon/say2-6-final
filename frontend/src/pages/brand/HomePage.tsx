import { Link } from "react-router-dom";
import {
  Sparkles, ArrowRight, ArrowUpRight,
  ShieldCheck, Zap, Database, BrainCircuit, ChevronDown,
} from "lucide-react";
import { BrandShell } from "../../components/brand/BrandShell";
import { SystemFlowShowcase } from "../../components/brand/SystemFlowShowcase";
import { Reveal } from "../../components/brand/anim/Reveal";

export default function HomePage() {
  return (
    <BrandShell transparent>
      <Hero />
      <Stats />
      <SystemFlowShowcase />
      <ProductPreview />
      <TechStack />
      <FinalCTA />
    </BrandShell>
  );
}

// ─────────────────────────────────────────────────────
// Hero — 응급실 배경 + 스크롤 인 텍스트
// ─────────────────────────────────────────────────────
function Hero() {
  return (
    <section className="relative overflow-hidden min-h-[100vh] flex items-center bg-vuno-bg">
      {/* 배경 — Vimeo 백그라운드 비디오 + 다크 오버레이 */}
      <div className="absolute inset-0 z-0 overflow-hidden">
        {/* Vimeo iframe — viewport cover (16:9 비율 유지) */}
        <video
          src="/hero-video.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* 다크 그라데이션 (좌측 카피 가독성) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, rgba(15, 23, 42, 0.92) 0%, rgba(15, 23, 42, 0.7) 50%, rgba(15, 23, 42, 0.35) 100%)",
          }}
        />
        {/* 시안 글로우 (은은하게) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 80% 30%, rgba(45, 212, 191, 0.12), transparent 50%)," +
              "radial-gradient(ellipse at 20% 70%, rgba(45, 212, 191, 0.06), transparent 50%)",
          }}
        />
      </div>

      <div className="relative z-10 max-w-[1400px] mx-auto px-6 py-24 w-full">
        {/* 카피 (단일 컬럼, 좌측 정렬) */}
        <div className="max-w-5xl">
          <Reveal delay={0}>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-vuno-cyan/50 bg-vuno-cyan/10 backdrop-blur text-xs font-bold text-vuno-cyan mb-8 tracking-[0.15em] uppercase">
              <Sparkles className="h-3.5 w-3.5" />
              EMON Med® Solution
            </div>
          </Reveal>

          {/* 2줄 전체에 Reveal 1번. inline style로 어떤 CSS 충돌도 우회. */}
          <Reveal delay={300}>
            <div
              role="heading"
              aria-level={1}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                fontWeight: 700,
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
                color: "#FFFFFF",
              }}
              className="text-3xl md:text-4xl lg:text-[56px]"
            >
              <div style={{ whiteSpace: "nowrap" }}>응급의료의 새로운 지평,</div>
              <div style={{ whiteSpace: "nowrap" }}>
                <span style={{ color: "#21d4d4" }}>EMON</span>이 통합 지능으로 지휘합니다.
              </div>
            </div>
          </Reveal>

          <Reveal delay={1700} className="mt-8 max-w-2xl">
            <p className="text-base text-slate-200 leading-relaxed drop-shadow">
              ECG·CXR·LAB 데이터의 동시 분석을 넘어 6시간 뒤의 예후 예측까지.
              EMON은 흩어져 있던 응급 데이터를 중앙에서 정교하게 조율하고,
              49,743건의 대규모 임상 사례를 실시간 대조하여 의사가 즉시 신뢰할
              수 있는,
            </p>
            <p
              className="text-base text-slate-200 leading-relaxed drop-shadow mt-2"
              style={{ whiteSpace: "nowrap" }}
            >
              완성형 소견서를 제안합니다.
            </p>
          </Reveal>

          <Reveal delay={2000} className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 h-12 px-6 font-bold bg-vuno-cyan text-vuno-bg hover:bg-vuno-cyanGlow transition-colors tracking-wider uppercase text-sm shadow-[0_0_30px_rgba(33,212,212,0.4)]"
            >
              <span className="relative flex h-2 w-2 mr-1">
                <span className="absolute inline-flex h-full w-full rounded-full bg-vuno-bg opacity-50 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-vuno-bg" />
              </span>
              Live Demo 시작
              <ArrowUpRight className="h-4 w-4" />
            </Link>
            <Link
              to="/technology"
              className="inline-flex items-center gap-2 h-12 px-6 font-bold border border-white/40 text-white hover:bg-white/10 transition-colors tracking-wider uppercase text-sm backdrop-blur"
            >
              기술 자세히
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>

          <Reveal delay={2300} className="mt-10 flex items-center gap-6 text-xs text-slate-300">
            <Cert label="FHIR R4 표준" />
            <Cert label="의료법 5년 감사" />
            <Cert label="AWS Multi-AZ" />
          </Reveal>
        </div>

      </div>

      {/* 스크롤 인디케이터 (VUNO 스타일) */}
      <div className="absolute left-6 bottom-8 z-20 hidden md:flex flex-col items-center gap-3">
        <span className="text-[10px] text-white/60 tracking-[0.3em] uppercase [writing-mode:vertical-rl]">
          Scroll Down
        </span>
        <ChevronDown className="h-4 w-4 text-white/60 animate-bounce" />
      </div>
    </section>
  );
}

function Cert({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <ShieldCheck className="h-4 w-4 text-vuno-cyan" />
      {label}
    </div>
  );
}


// ─────────────────────────────────────────────────────
// Stats
// ─────────────────────────────────────────────────────
function Stats() {
  const stats = [
    { value: "92%",     label: "AI Accuracy" },
    { value: "28s",     label: "Avg. Analysis Time" },
    { value: "49,743",  label: "MIMIC-IV Cases" },
    { value: "3+1",     label: "Modals + RAG" },
  ];
  return (
    <section className="border-y border-vuno-divider bg-vuno-bg">
      <div className="max-w-[1400px] mx-auto px-6 py-20 grid grid-cols-2 md:grid-cols-4 gap-8">
        {stats.map((s, i) => (
          <Reveal key={s.label} delay={i * 100} className="text-center">
            <div className="text-4xl md:text-6xl font-bold text-vuno-cyan font-numeric tracking-tight">
              {s.value}
            </div>
            <div className="text-xs text-vuno-muted mt-2 tracking-[0.15em] uppercase">{s.label}</div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
// Product Preview
// ─────────────────────────────────────────────────────
function ProductPreview() {
  const modalities = [
    {
      num: "01",
      to: "/product/ecg",
      title: "ECG Analysis",
      sub: "심전도 12-Lead",
      desc: "STEMI · 부정맥 · 전도 장애 자동 분류",
      illust: EcgIllust,
    },
    {
      num: "02",
      to: "/product/cxr",
      title: "CXR Analysis",
      sub: "흉부 X-ray",
      desc: "폐 침윤 · 심비대 · 기흉 분류 + 히트맵",
      illust: CxrIllust,
    },
    {
      num: "03",
      to: "/product/lab",
      title: "LAB Analysis",
      sub: "혈액 검사",
      desc: "Troponin · CK-MB · WBC 이상치 통합 해석",
      illust: LabIllust,
    },
  ];

  return (
    <section className="py-20 border-t border-vuno-divider bg-vuno-bg">
      <div className="max-w-[1400px] mx-auto px-6 grid grid-cols-1 lg:grid-cols-[500px_1fr] gap-12 lg:gap-20 items-center">
        {/* 좌측 — 거대 타이틀 + 설명 + CTA (컬럼 영역 가로 중앙 정렬) */}
        <Reveal className="flex flex-col items-center text-center">
          <h2 className="text-6xl md:text-7xl font-bold text-white leading-[1.05] tracking-tight">
            EMON<sup className="text-3xl align-super">®</sup><br />
            AI Solution
          </h2>
          <p className="mt-8 text-xl md:text-2xl text-vuno-muted leading-relaxed">
            인공지능이 융합될 수 있는<br />
            광범위한 응급의료 데이터를 분석해<br />
            응급실 현장의 혁신을 주도합니다.
          </p>
          <Link
            to="/product"
            className="inline-flex items-center justify-center mt-10 h-16 px-14 font-bold bg-vuno-cyan text-vuno-bg hover:bg-vuno-cyanGlow transition-colors text-lg"
          >
            더 알아보기
          </Link>
        </Reveal>

        {/* 우측 — 3개 모달 리스트 (VUNO 스타일) */}
        <div className="flex flex-col">
          {modalities.map((m, i) => (
            <Link
              key={m.num}
              to={m.to}
              className={
                "group flex items-center gap-8 py-10 transition-all hover:pl-2 " +
                (i < modalities.length - 1 ? "border-b border-vuno-divider" : "")
              }
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-bold text-vuno-cyan font-numeric tracking-[0.25em] mb-3">{m.num}</div>
                <h3 className="text-3xl md:text-4xl font-bold text-white mb-2.5 group-hover:text-vuno-cyan transition-colors leading-tight">
                  {m.title}
                </h3>
                <p className="text-base md:text-lg text-vuno-muted leading-relaxed">{m.desc}</p>
              </div>
              <m.illust />
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────── 모달 라인 일러스트 (VUNO 스타일 — 크고 깔끔한 라인 아트) ───────── */
const ILLUST_SIZE = "w-36 h-36 md:w-48 md:h-48";

function EcgIllust() {
  // 심전도 모니터 + 파형 (VUNO Biosignals 스타일)
  return (
    <svg viewBox="0 0 160 160" className={`${ILLUST_SIZE} flex-shrink-0 hidden md:block`} fill="none">
      {/* 모니터 외곽 */}
      <rect x="20" y="40" width="120" height="80" stroke="white" strokeWidth="1.5" rx="2" />
      <rect x="20" y="40" width="120" height="80" stroke="#2DD4BF" strokeWidth="0.5" rx="2" opacity="0.3" />
      {/* 스탠드 */}
      <line x1="80" y1="120" x2="80" y2="135" stroke="white" strokeWidth="1.5" />
      <line x1="60" y1="135" x2="100" y2="135" stroke="white" strokeWidth="1.5" />
      {/* 파형 */}
      <path
        d="M 28 80 L 50 80 L 56 65 L 62 95 L 68 55 L 76 80 L 100 80 L 106 65 L 112 95 L 118 55 L 126 80 L 132 80"
        stroke="#2DD4BF" strokeWidth="1.5" fill="none" strokeLinejoin="round"
      />
      {/* 보조 파형 */}
      <path d="M 28 105 L 50 105 L 56 100 L 64 110 L 70 100 L 78 105 L 132 105"
        stroke="white" strokeWidth="0.8" fill="none" opacity="0.4" />
      {/* 작은 차트 박스 (우상단) */}
      <rect x="115" y="48" width="20" height="14" stroke="white" strokeWidth="0.6" opacity="0.5" />
      <path d="M 117 58 L 121 52 L 125 56 L 129 50 L 133 54" stroke="#2DD4BF" strokeWidth="0.8" fill="none" />
      {/* 사람 아이콘 (좌상단 작은 표시) */}
      <circle cx="30" cy="50" r="2" stroke="white" strokeWidth="0.6" fill="none" opacity="0.5" />
    </svg>
  );
}

function CxrIllust() {
  // 흉부 X-ray + 모니터 프레임 (VUNO Medical Imaging 스타일)
  return (
    <svg viewBox="0 0 160 160" className={`${ILLUST_SIZE} flex-shrink-0 hidden md:block`} fill="none">
      {/* 모니터 외곽 */}
      <rect x="22" y="22" width="116" height="100" stroke="white" strokeWidth="1.5" rx="2" />
      {/* 모니터 상단 */}
      <line x1="22" y1="32" x2="138" y2="32" stroke="white" strokeWidth="0.8" />
      <rect x="120" y="25" width="8" height="3" fill="white" opacity="0.4" />
      {/* 스탠드 */}
      <line x1="80" y1="122" x2="80" y2="138" stroke="white" strokeWidth="1.5" />
      <line x1="55" y1="138" x2="105" y2="138" stroke="white" strokeWidth="1.5" />
      {/* 흉곽 */}
      <ellipse cx="80" cy="75" rx="42" ry="35" stroke="white" strokeWidth="1" />
      <ellipse cx="65" cy="75" rx="14" ry="26" stroke="#2DD4BF" strokeWidth="1" />
      <ellipse cx="95" cy="75" rx="14" ry="26" stroke="#2DD4BF" strokeWidth="1" />
      <line x1="80" y1="44" x2="80" y2="106" stroke="white" strokeWidth="0.8" />
      {/* 갈비뼈 */}
      {[55, 65, 75, 85, 95].map((y) => (
        <path key={y} d={`M 42 ${y} Q 80 ${y - 4}, 118 ${y}`} stroke="white" strokeWidth="0.5" opacity="0.5" />
      ))}
      {/* 히트맵 */}
      <circle cx="92" cy="82" r="8" fill="#2DD4BF" opacity="0.3" />
      <circle cx="92" cy="82" r="4" fill="#2DD4BF" opacity="0.6" />
    </svg>
  );
}

function LabIllust() {
  // 모니터 + 시계열 차트 + 데이터 (VUNO Biosignals/Vital 스타일)
  return (
    <svg viewBox="0 0 160 160" className={`${ILLUST_SIZE} flex-shrink-0 hidden md:block`} fill="none">
      {/* 모니터 외곽 */}
      <rect x="20" y="35" width="120" height="85" stroke="white" strokeWidth="1.5" rx="2" />
      {/* 스탠드 */}
      <line x1="80" y1="120" x2="80" y2="135" stroke="white" strokeWidth="1.5" />
      <line x1="60" y1="135" x2="100" y2="135" stroke="white" strokeWidth="1.5" />
      {/* 메인 차트 영역 */}
      <line x1="32" y1="100" x2="128" y2="100" stroke="white" strokeWidth="0.6" opacity="0.6" />
      <line x1="32" y1="100" x2="32" y2="50" stroke="white" strokeWidth="0.6" opacity="0.6" />
      {/* 바 차트 */}
      <rect x="40" y="78" width="6" height="22" fill="#2DD4BF" opacity="0.5" />
      <rect x="50" y="70" width="6" height="30" fill="#2DD4BF" opacity="0.7" />
      <rect x="60" y="82" width="6" height="18" fill="#2DD4BF" opacity="0.4" />
      <rect x="70" y="62" width="6" height="38" fill="#2DD4BF" />
      <rect x="80" y="75" width="6" height="25" fill="#2DD4BF" opacity="0.6" />
      <rect x="90" y="68" width="6" height="32" fill="#2DD4BF" opacity="0.8" />
      <rect x="100" y="80" width="6" height="20" fill="#2DD4BF" opacity="0.5" />
      <rect x="110" y="72" width="6" height="28" fill="#2DD4BF" opacity="0.7" />
      {/* 라인 차트 (위쪽) */}
      <path d="M 40 60 L 56 58 L 72 50 L 88 55 L 104 48 L 120 52" stroke="white" strokeWidth="1" fill="none" />
      {[40, 56, 72, 88, 104, 120].map((x, i) => (
        <circle key={x} cx={x} cy={[60, 58, 50, 55, 48, 52][i]} r="1.5" fill="white" />
      ))}
      {/* 사람 아이콘 */}
      <circle cx="120" cy="110" r="2.5" stroke="#2DD4BF" strokeWidth="0.8" fill="none" />
      <path d="M 116 116 Q 120 113, 124 116" stroke="#2DD4BF" strokeWidth="0.8" fill="none" />
    </svg>
  );
}

// ─────────────────────────────────────────────────────
// Tech Stack
// ─────────────────────────────────────────────────────
function TechStack() {
  const items = [
    { icon: BrainCircuit, title: "Multi-Modal Inference", desc: "ECG·CXR·LAB 병렬 추론" },
    { icon: Database,     title: "RAG / ChromaDB",        desc: "MIMIC-IV 49,743건 검색" },
    { icon: ShieldCheck,  title: "FHIR R4 Standard",      desc: "병원 EMR 호환" },
    { icon: Zap,          title: "AWS Multi-AZ",          desc: "응급실 무중단 보장" },
  ];
  return (
    <section className="py-28 bg-vuno-bg">
      <div className="max-w-[1400px] mx-auto px-6">
        <Reveal className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-vuno-cyan/40 text-vuno-cyan text-xs font-bold uppercase tracking-[0.2em] mb-5">
            Core Technology
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white">
            의료 표준 위에 쌓은<br />
            <span className="text-vuno-cyan">최신 AI 스택</span>
          </h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto">
          {items.map((it, i) => (
            <Reveal key={it.title} delay={i * 120}>
              <div className="border border-vuno-border bg-vuno-surface p-6 hover:border-vuno-cyan transition-colors h-full">
                <div className="h-10 w-10 bg-vuno-bg border border-vuno-cyan/40 grid place-items-center text-vuno-cyan mb-4">
                  <it.icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-white">{it.title}</h3>
                <p className="text-sm text-vuno-muted mt-1.5">{it.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            to="/technology"
            className="inline-flex items-center gap-1 text-sm font-bold text-vuno-cyan hover:text-vuno-cyanGlow tracking-wider"
          >
            전체 기술 스택 보기 <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────
// Final CTA
// ─────────────────────────────────────────────────────
function FinalCTA() {
  return (
    <section className="py-24 bg-vuno-bg">
      <Reveal className="max-w-[1100px] mx-auto px-6">
        <div className="border border-vuno-cyan/40 bg-vuno-surface p-12 md:p-16 text-center relative overflow-hidden">
          {/* 글로우 */}
          <div className="absolute -inset-12 bg-vuno-cyan/10 blur-3xl pointer-events-none" />

          <div className="relative">
            <h2 className="text-3xl md:text-5xl font-bold leading-tight text-white">
              응급실 AI 도입, <br className="md:hidden" />
              <span className="text-vuno-cyan">지금 체험해보세요.</span>
            </h2>
            <p className="mt-5 text-lg text-vuno-muted max-w-2xl mx-auto">
              로그인부터 소견서 서명까지, 실제 의료진이 사용하는 시스템 그대로.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 h-12 px-8 font-bold bg-vuno-cyan text-vuno-bg hover:bg-vuno-cyanGlow transition-colors tracking-wider uppercase text-sm"
              >
                ▶ Live Demo
                <ArrowUpRight className="h-4 w-4" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex items-center gap-2 h-12 px-8 font-bold border border-vuno-border text-white hover:bg-vuno-elevated transition-colors tracking-wider uppercase text-sm"
              >
                파일럿 문의
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
