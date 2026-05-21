import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity, FlaskConical, Image as ImageIcon, Sparkles,
  ArrowUpRight, ChevronRight,
} from "lucide-react";
import { BrandShell } from "../../components/brand/BrandShell";
import { Reveal } from "../../components/brand/anim/Reveal";
import { cn } from "../../lib/cn";

type ModalKey = "ecg" | "cxr" | "lab";

interface ModalSpec {
  key: ModalKey;
  num: string;
  title: string;          // 영문 제품명
  ko: string;             // 한글 부제
  shortDesc: string;      // 좌측 리스트용 짧은 설명
  longDesc: string;       // 우측 미리보기용 긴 설명
  link: string;
  // 우측 미리보기 일러스트 (JSX)
  preview: () => JSX.Element;
  icon: typeof Activity;
}

const MODALS: ModalSpec[] = [
  {
    key: "ecg",
    num: "01",
    title: "EMON ECG",
    ko: "심전도 12-Lead AI 판독",
    shortDesc: "STEMI · 부정맥 · 전도 장애 분류",
    longDesc: "12-Lead 심전도를 PyTorch 기반 딥러닝 모델로 자동 판독합니다. ST 상승, 부정맥, 전도 장애 등 응급 심혈관 이벤트를 평균 2초 내에 감지하고 신뢰도와 함께 제공합니다.",
    link: "/product/ecg",
    preview: EcgPreview,
    icon: Activity,
  },
  {
    key: "cxr",
    num: "02",
    title: "EMON CXR",
    ko: "흉부 X-ray AI 판독",
    shortDesc: "폐 침윤 · 심비대 · 기흉 분류",
    longDesc: "흉부 X-ray 영상의 주요 비정상 소견 여부와 위치 정보를 ONNX GPU 추론(~3초)으로 제공해 의료진의 판독을 보조합니다. AP/PA 모두 지원.",
    link: "/product/cxr",
    preview: CxrPreview,
    icon: ImageIcon,
  },
  {
    key: "lab",
    num: "03",
    title: "EMON LAB",
    ko: "혈액 검사 AI 위험도 평가",
    shortDesc: "Troponin · CK-MB · WBC 통합 해석",
    longDesc: "Troponin · CK-MB · WBC · CRP 등 응급 검사 항목을 XGBoost 기반 모델로 통합 해석. 시계열 트렌드와 함께 급성 심근경색 · 패혈증 · 신기능 저하 위험을 평가합니다.",
    link: "/product/lab",
    preview: LabPreview,
    icon: FlaskConical,
  },
];

export default function ProductPage() {
  return (
    <BrandShell>
      <PageHero />
      <SolutionExplorer />
      <BottomCTA />
    </BrandShell>
  );
}

function PageHero() {
  return (
    <section className="border-b border-vuno-divider bg-vuno-bg">
      <div className="max-w-[1400px] mx-auto px-6 py-20 md:py-28">
        <Reveal>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-vuno-cyan/40 text-vuno-cyan text-xs font-bold uppercase tracking-[0.2em] mb-6">
            Product
          </div>
          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-white max-w-3xl">
            응급실 멀티모달 AI<br />
            <span className="text-vuno-cyan">진단보조 솔루션</span>
          </h1>
          <p className="mt-6 text-lg text-vuno-muted leading-relaxed max-w-2xl">
            ECG·CXR·LAB을 동시에 분석하고, RAG로 유사 사례를 검색해 의사에게
            1차 소견을 정리합니다. 최종 결정은 항상 의사.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function SolutionExplorer() {
  const [active, setActive] = useState<ModalKey>("ecg");
  const current = MODALS.find((m) => m.key === active)!;

  return (
    <section className="py-24 bg-vuno-bg">
      <div className="max-w-[1400px] mx-auto px-6">
        {/* 카테고리 헤더 */}
        <Reveal className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-vuno-cyan/40 text-vuno-cyan text-xs font-bold uppercase tracking-[0.2em] mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            응급보조 AI
          </div>
          <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight">
            EMON Modality<br />
            <span className="text-vuno-cyan">3종 솔루션</span>
          </h2>
          <p className="mt-5 text-lg text-vuno-muted max-w-2xl">
            모달을 선택하면 우측에 미리보기가 나타나고, 클릭하면 상세 페이지로 이동합니다.
          </p>
        </Reveal>

        {/* 좌측 리스트 + 우측 미리보기 */}
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8 lg:gap-12">
          {/* 좌측 모달 리스트 */}
          <Reveal>
            <nav className="space-y-1 lg:sticky lg:top-32">
              {MODALS.map((m) => {
                const isActive = m.key === active;
                return (
                  <button
                    key={m.key}
                    onMouseEnter={() => setActive(m.key)}
                    onClick={() => setActive(m.key)}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-4 text-left border-l-2 transition-all",
                      isActive
                        ? "border-vuno-cyan bg-vuno-surface text-vuno-cyan"
                        : "border-transparent text-white hover:text-vuno-cyan hover:bg-vuno-surface/30",
                    )}
                  >
                    <m.icon className={cn("h-5 w-5 flex-shrink-0", isActive ? "text-vuno-cyan" : "text-vuno-muted")} />
                    <div className="flex-1">
                      <div className="text-lg font-bold">{m.title}</div>
                      <div className={cn("text-xs mt-0.5", isActive ? "text-vuno-cyan/70" : "text-vuno-muted")}>
                        {m.ko}
                      </div>
                    </div>
                    {isActive && <ChevronRight className="h-4 w-4" />}
                  </button>
                );
              })}
            </nav>
          </Reveal>

          {/* 우측 미리보기 */}
          <div className="min-h-[500px]">
            <Reveal key={active}>
              <div className="border border-vuno-border bg-vuno-surface overflow-hidden">
                {/* 미리보기 일러스트 */}
                <div className="bg-vuno-bg p-8 border-b border-vuno-border">
                  {current.preview()}
                </div>

                {/* 설명 */}
                <div className="p-8">
                  <div className="text-xs font-bold text-vuno-cyan font-numeric tracking-[0.2em] mb-3">
                    {current.num}
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-2">
                    {current.title}<span className="text-vuno-cyan">®</span>
                  </h3>
                  <div className="text-base text-vuno-cyan/80 mb-5">{current.ko}</div>
                  <p className="text-base text-vuno-muted leading-relaxed mb-8">
                    {current.longDesc}
                  </p>

                  <Link
                    to={current.link}
                    className="inline-flex items-center gap-2 h-12 px-6 font-bold bg-vuno-cyan text-vuno-bg hover:bg-vuno-cyanGlow transition-colors tracking-wider uppercase text-sm"
                  >
                    {current.title} 자세히 보기
                    <ArrowUpRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────────────────────────────────
   각 모달 우측 미리보기 (큰 일러스트)
   ─────────────────────────────────────────────────────── */
function EcgPreview() {
  return (
    <div className="relative">
      <div className="text-[10px] font-bold text-vuno-cyan tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
        <span className="px-2 py-0.5 bg-red-500 text-white">LVSD Detected</span>
        <span className="text-vuno-muted">12-Lead · 25 mm/s</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 font-numeric">
        {["I", "aVR", "V1", "V4", "II", "aVL", "V2", "V5", "III", "aVF", "V3", "V6"].map((lead) => (
          <div key={lead} className="flex items-center gap-3">
            <span className="w-8 text-xs text-vuno-cyan font-bold">{lead}</span>
            <svg viewBox="0 0 200 20" className="flex-1 h-5">
              <path
                d={lead === "V2" || lead === "V3" || lead === "V4"
                  ? "M0,10 L20,10 L25,2 L30,16 L35,1 L45,10 L70,10 L75,2 L80,16 L85,1 L95,10 L120,10 L125,2 L130,16 L135,1 L145,10 L170,10 L175,2 L180,16 L185,1 L195,10 L200,10"
                  : "M0,10 L20,10 L25,6 L30,14 L35,4 L45,10 L70,10 L75,6 L80,14 L85,4 L95,10 L120,10 L125,6 L130,14 L135,4 L145,10 L170,10 L175,6 L180,14 L185,4 L195,10 L200,10"}
                stroke={lead === "V2" || lead === "V3" || lead === "V4" ? "#EF4444" : "#21D4D4"}
                strokeWidth="0.7" fill="none"
              />
            </svg>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2 mt-6">
        <PreviewStat label="HR" value="80" unit="bpm" />
        <PreviewStat label="PR" value="164" unit="ms" />
        <PreviewStat label="QRS" value="86" unit="ms" />
        <PreviewStat label="QTc" value="394" unit="ms" />
      </div>
    </div>
  );
}

function CxrPreview() {
  return (
    <div className="relative">
      <div className="text-[10px] font-bold text-vuno-cyan tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
        <span className="px-2 py-0.5 bg-red-500 text-white">Abnormal · 89%</span>
        <span className="text-vuno-muted">PA View · 2400×2400</span>
      </div>
      <div className="aspect-[4/3] bg-black border border-vuno-border/40 relative">
        <svg viewBox="0 0 200 150" className="w-full h-full">
          {/* 흉곽 */}
          <ellipse cx="100" cy="75" rx="80" ry="60" fill="#0F172A" stroke="#475569" strokeWidth="0.5" />
          <ellipse cx="65" cy="75" rx="22" ry="40" fill="#1E293B" stroke="#64748B" strokeWidth="0.4" />
          <ellipse cx="135" cy="75" rx="22" ry="40" fill="#1E293B" stroke="#64748B" strokeWidth="0.4" />
          <line x1="100" y1="20" x2="100" y2="130" stroke="#475569" strokeWidth="1" />
          {/* 갈비뼈 */}
          {[35, 50, 65, 80, 95, 110].map((y) => (
            <path key={y} d={`M 30 ${y} Q 100 ${y - 4}, 170 ${y}`} fill="none" stroke="#64748B" strokeWidth="0.3" opacity="0.6" />
          ))}
          {/* 히트맵 (이상부위) */}
          <circle cx="125" cy="82" r="18" fill="url(#cxr-heat)" opacity="0.85" />
          <defs>
            <radialGradient id="cxr-heat">
              <stop offset="0%" stopColor="#EF4444" />
              <stop offset="40%" stopColor="#F59E0B" />
              <stop offset="80%" stopColor="#FBBF24" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* 라벨 */}
          <text x="118" y="58" fontSize="6" fill="#EF4444" fontWeight="bold">Cons 32%</text>
        </svg>
        <div className="absolute top-2 left-2 text-xs font-bold text-vuno-cyan">R</div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <PreviewStat label="Consolidation" value="32" unit="%" warn />
        <PreviewStat label="Nodule" value="2" unit="cm" warn />
        <PreviewStat label="Effusion" value="—" unit="" />
      </div>
    </div>
  );
}

function LabPreview() {
  return (
    <div className="relative">
      <div className="text-[10px] font-bold text-vuno-cyan tracking-[0.2em] uppercase mb-3 flex items-center gap-2">
        <span className="px-2 py-0.5 bg-red-500 text-white">Acute MI 의심</span>
        <span className="text-vuno-muted">5-day Trend</span>
      </div>
      {/* 시계열 차트 */}
      <div className="bg-vuno-bg border border-vuno-border/40 p-4 mb-3">
        <svg viewBox="0 0 300 100" className="w-full h-24">
          <line x1="20" y1="80" x2="290" y2="80" stroke="#475569" strokeWidth="0.5" />
          {[20, 40, 60].map((y) => (
            <line key={y} x1="20" y1={y} x2="290" y2={y} stroke="#334155" strokeWidth="0.3" strokeDasharray="2,2" />
          ))}
          {/* 데이터 라인 — Troponin trend */}
          <path d="M 30 70 L 80 65 L 130 50 L 180 30 L 230 20 L 280 15" stroke="#EF4444" strokeWidth="1.5" fill="none" />
          <path d="M 30 70 L 80 65 L 130 50 L 180 30 L 230 20 L 280 15 L 280 80 L 30 80 Z" fill="#EF4444" opacity="0.1" />
          {/* 정상 라인 */}
          <line x1="20" y1="70" x2="290" y2="70" stroke="#22C55E" strokeWidth="0.5" strokeDasharray="3,3" />
          {/* 데이터 포인트 */}
          {[
            { x: 30, y: 70 }, { x: 80, y: 65 }, { x: 130, y: 50 },
            { x: 180, y: 30 }, { x: 230, y: 20 }, { x: 280, y: 15 },
          ].map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r="2" fill="#EF4444" />
          ))}
          {/* 라벨 */}
          <text x="22" y="14" fontSize="6" fill="#94A3B8">Troponin (ng/mL)</text>
        </svg>
      </div>
      {/* 핵심 검사값 */}
      <div className="grid grid-cols-4 gap-2">
        <PreviewStat label="Troponin" value="0.82" unit="ng/mL" warn />
        <PreviewStat label="CK-MB"    value="12.4" unit="ng/mL" warn />
        <PreviewStat label="WBC"      value="10.2" unit="10³/µL" />
        <PreviewStat label="Cr"       value="0.9"  unit="mg/dL" />
      </div>
    </div>
  );
}

function PreviewStat({ label, value, unit, warn }: { label: string; value: string; unit: string; warn?: boolean }) {
  return (
    <div className="bg-vuno-bg border border-vuno-border/60 px-2.5 py-2">
      <div className="text-[10px] text-vuno-dim uppercase tracking-wider truncate">{label}</div>
      <div className={"text-base font-bold font-numeric mt-0.5 " + (warn ? "text-red-400" : "text-vuno-cyan")}>
        {value}
        <span className="text-[10px] font-normal text-vuno-muted ml-0.5">{unit}</span>
      </div>
    </div>
  );
}

function BottomCTA() {
  return (
    <section className="py-20 border-t border-vuno-divider">
      <div className="max-w-[900px] mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white">
          실제 화면으로 직접 확인하세요
        </h2>
        <p className="mt-3 text-vuno-muted">
          5명의 데모 환자가 등록되어 있습니다. 클릭 한 번이면 됩니다.
        </p>
        <Link
          to="/demo"
          className="inline-flex items-center gap-2 mt-7 h-12 px-8 font-bold bg-vuno-cyan text-vuno-bg hover:bg-vuno-cyanGlow transition-colors tracking-wider uppercase text-sm"
        >
          Live Demo 시작
          <ArrowUpRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
