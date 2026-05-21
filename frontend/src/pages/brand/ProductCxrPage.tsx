import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { BrandShell } from "../../components/brand/BrandShell";
import { Reveal } from "../../components/brand/anim/Reveal";

export default function ProductCxrPage() {
  return (
    <BrandShell>
      <Hero />
      <ProductScreen />
      <FeatureSection />
      <SpecSection />
      <BottomCTA />
    </BrandShell>
  );
}

function Hero() {
  return (
    <section className="border-b border-vuno-divider bg-vuno-bg">
      <div className="max-w-[1400px] mx-auto px-6 py-16">
        <Link to="/product" className="inline-flex items-center gap-1.5 text-sm text-vuno-muted hover:text-white mb-6">
          <ArrowLeft className="h-4 w-4" /> Products
        </Link>

        <Reveal>
          <div className="text-xs text-vuno-muted mb-3">
            <Link to="/" className="hover:text-white">Home</Link>
            <span className="mx-2">/</span>
            <Link to="/product" className="hover:text-white">Products</Link>
            <span className="mx-2">/</span>
            <span className="text-vuno-cyan">EMON CXR</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-white">
            EMON CXR<sup className="text-vuno-cyan text-2xl md:text-3xl">®</sup>
            <span className="text-vuno-cyan">™</span>
          </h1>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className="inline-flex items-center gap-2 text-vuno-cyan font-semibold mb-3">
                <span className="h-8 w-8 rounded-full border border-vuno-cyan/40 grid place-items-center text-xs">🫁</span>
                EMON CXR · Chest X-Ray AI
              </div>
              <p className="text-xl text-white leading-relaxed">
                흉부 X-ray 영상의 주요 비정상 소견 여부와 위치 정보를
                제공해 의료진의 판독을 보조합니다.
              </p>
            </div>
            <div className="flex items-end justify-start lg:justify-end">
              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 h-12 px-7 border border-vuno-cyan text-vuno-cyan hover:bg-vuno-cyan hover:text-vuno-bg transition-colors font-bold tracking-wider uppercase text-sm"
              >
                문의사항 남기기
              </Link>
            </div>
          </div>

          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4">
            <CertBadge icon="🫁" title="인공지능 흉부 X-ray 판독 보조 솔루션" />
            <CertBadge icon="🏅" title="혁신의료기기 지정" />
            <CertBadge icon="✓" title="식품의약품안전처 허가획득" />
            <CertBadge icon="CE" title="CE 인증 획득" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function CertBadge({ icon, title }: { icon: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-12 w-12 rounded-full border border-vuno-cyan/30 grid place-items-center text-vuno-cyan text-base font-bold flex-shrink-0">
        {icon}
      </div>
      <div className="text-sm text-white leading-tight">{title}</div>
    </div>
  );
}

function ProductScreen() {
  return (
    <section className="py-24 bg-vuno-bg border-t border-vuno-divider">
      <div className="max-w-[1400px] mx-auto px-6">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-12 items-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-vuno-cyan/40 text-vuno-cyan text-xs font-bold uppercase tracking-[0.2em] mb-4">
              Ready to Support
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              주요 흉부 X-ray 소견의<br />
              정상·비정상 여부와<br />
              <span className="text-vuno-cyan">소견명을 확신도(%)와 함께</span><br />
              제공합니다.
            </h2>
            <p className="mt-5 text-vuno-muted leading-relaxed">
              AP 및 PA 흉부 X-ray 촬영 방식 모두 포괄함으로써 의료현장에 최적화된
              기능을 제공합니다. 의료진 선호도에 따라 소견 표시 여부를 세팅할 수 있습니다.
            </p>
          </Reveal>

          {/* CXR 판독 화면 — 좌측 환자 목록 + 우측 X-ray + 히트맵 */}
          <Reveal delay={200}>
            <CxrScreen />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function CxrScreen() {
  return (
    <div className="border border-vuno-border bg-[#0E1A2B] shadow-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="bg-[#142235] px-4 py-2 border-b border-vuno-border flex items-center justify-between text-xs">
        <span className="text-white font-bold tracking-wider">
          EMON CXR<sup className="text-vuno-cyan">™</sup> · Chest X-Ray
          <span className="ml-3 text-vuno-muted">ver 1.0.0</span>
        </span>
        <span className="text-vuno-cyan font-bold tracking-wider">EMON</span>
      </div>

      <div className="grid grid-cols-[180px_1fr] divide-x divide-vuno-border">
        {/* 좌측 환자 리스트 */}
        <div className="bg-[#142235] p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 flex-1 bg-[#0E1A2B] border border-vuno-border" />
            <button className="h-6 w-6 grid place-items-center text-vuno-cyan border border-vuno-border bg-[#0E1A2B] text-xs">🔍</button>
          </div>
          <div className="grid grid-cols-2 gap-1 mb-2 text-[9px]">
            <button className="bg-[#0E1A2B] border border-vuno-border text-vuno-muted py-1">Today</button>
            <button className="bg-[#0E1A2B] border border-vuno-border text-vuno-muted py-1">Last week</button>
          </div>

          <div className="space-y-0.5">
            {[
              { id: "042", name: "김OO",  score: "98%", active: true },
              { id: "041", name: "이OO",  score: "92%" },
              { id: "040", name: "박OO",  score: "78%" },
              { id: "039", name: "정OO",  score: "72%" },
              { id: "038", name: "최OO",  score: "56%" },
              { id: "037", name: "윤OO",  score: "35%" },
              { id: "036", name: "강OO",  score: "N"   },
            ].map((p) => (
              <div
                key={p.id}
                className={
                  "flex items-center justify-between px-1.5 py-1 text-[10px] " +
                  (p.active ? "bg-vuno-cyan/15 text-vuno-cyan border border-vuno-cyan/40" : "text-vuno-muted")
                }
              >
                <span className="font-numeric">{p.id}</span>
                <span>{p.name}</span>
                <span className={"font-numeric font-bold " + (parseInt(p.score) > 70 ? "text-red-400" : "text-vuno-muted")}>
                  {p.score}
                </span>
              </div>
            ))}
          </div>

          <button className="w-full mt-4 py-1.5 bg-vuno-cyan/20 border border-vuno-cyan text-vuno-cyan text-[10px] font-bold tracking-wider uppercase">
            ▶ Analyze
          </button>
        </div>

        {/* 우측 X-ray + 분석 */}
        <div className="bg-black p-4 relative">
          <svg viewBox="0 0 300 220" className="w-full">
            {/* 흉곽 */}
            <ellipse cx="150" cy="110" rx="120" ry="90" fill="#0F1419" stroke="#475569" strokeWidth="0.6" />
            <ellipse cx="100" cy="110" rx="32" ry="60" fill="#1A2233" stroke="#64748B" strokeWidth="0.5" />
            <ellipse cx="200" cy="110" rx="32" ry="60" fill="#1A2233" stroke="#64748B" strokeWidth="0.5" />
            <line x1="150" y1="30" x2="150" y2="190" stroke="#475569" strokeWidth="1" />
            {/* 갈비뼈 */}
            {[50, 70, 90, 110, 130, 150].map((y) => (
              <path key={y} d={`M 40 ${y} Q 150 ${y - 5}, 260 ${y}`} fill="none" stroke="#64748B" strokeWidth="0.4" opacity="0.6" />
            ))}
            {/* 히트맵 영역 1 (좌상단 - Ptx) */}
            <circle cx="100" cy="80" r="20" fill="url(#cxr-warm)" opacity="0.7" />
            <text x="120" y="55" fontSize="9" fill="#EF4444" fontWeight="bold">Ptx 89%</text>
            <line x1="100" y1="80" x2="120" y2="60" stroke="#EF4444" strokeWidth="0.5" />
            {/* 히트맵 영역 2 (우측 - Cons) */}
            <circle cx="200" cy="120" r="22" fill="url(#cxr-warm)" opacity="0.8" />
            <text x="225" y="100" fontSize="9" fill="#EF4444" fontWeight="bold">Cons 32%</text>
            <line x1="200" y1="120" x2="225" y2="105" stroke="#EF4444" strokeWidth="0.5" />
            <defs>
              <radialGradient id="cxr-warm">
                <stop offset="0%" stopColor="#EF4444" />
                <stop offset="50%" stopColor="#F59E0B" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
              </radialGradient>
            </defs>
          </svg>
          <div className="absolute top-2 left-2 text-xs font-bold text-white">R</div>
          {/* 우상단 결과 */}
          <div className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-[10px] font-bold tracking-wider">
            ABNORMAL
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureSection() {
  const features = [
    { num: "01", title: "AP/PA 모두 지원", desc: "Anterior-Posterior와 Posterior-Anterior 촬영 방식 모두 자동 판독." },
    { num: "02", title: "히트맵 위치 표시", desc: "비정상 영역을 색상 히트맵으로 강조해 판독 근거를 시각화." },
    { num: "03", title: "확신도(%) 제공", desc: "각 소견에 대한 모델 확신도를 함께 표시. 의료진 의사결정 보조." },
    { num: "04", title: "DICOM 호환",    desc: "표준 DICOM 입력 + JPG/PNG 모두 처리. PACS 즉시 연동 가능." },
  ];
  return (
    <section className="py-24 bg-vuno-bg border-t border-vuno-divider">
      <div className="max-w-[1400px] mx-auto px-6">
        <Reveal className="text-center mb-14">
          <h2 className="text-3xl md:text-5xl font-bold text-white">Key Features</h2>
        </Reveal>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((f, i) => (
            <Reveal key={f.num} delay={i * 100}>
              <div className="border border-vuno-border bg-vuno-surface p-6 h-full hover:border-vuno-cyan transition-colors">
                <div className="text-xs font-bold text-vuno-cyan font-numeric tracking-[0.2em] mb-3">{f.num}</div>
                <h3 className="text-lg font-bold text-white mb-3">{f.title}</h3>
                <p className="text-sm text-vuno-muted leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function SpecSection() {
  const specs = [
    { label: "AI 모델",        value: "ONNX (EfficientNet-B5 기반)" },
    { label: "입력 형식",       value: "DICOM · JPG · PNG (최대 2400×2400)" },
    { label: "추론 시간",       value: "평균 3.1초 (AWS Fargate 4vCPU/8GB)" },
    { label: "감지 소견",       value: "Consolidation · Nodule · Pneumothorax · Pleural Effusion · Cardiomegaly" },
    { label: "정확도 (AUROC)", value: "0.94 (CheXpert 검증)" },
    { label: "출력",           value: "JSON + 히트맵 PNG + FHIR DocumentReference" },
    { label: "통합",           value: "EMON Orchestrator · HAPI FHIR · S3 PACS" },
    { label: "인증",           value: "혁신의료기기 지정 · CE · 식약처 (Phase 2 예정)" },
  ];
  return (
    <section className="py-24 bg-vuno-surface/30">
      <div className="max-w-[1400px] mx-auto px-6">
        <Reveal className="mb-12">
          <h2 className="text-3xl md:text-5xl font-bold text-white">Specifications</h2>
        </Reveal>
        <div className="border border-vuno-border">
          {specs.map((s) => (
            <Reveal key={s.label}>
              <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6 px-6 py-5 border-b border-vuno-border last:border-0 hover:bg-vuno-surface/40 transition-colors">
                <div className="text-sm font-bold text-vuno-cyan uppercase tracking-wider">{s.label}</div>
                <div className="text-base text-white">{s.value}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="mt-12 grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            "Consolidation", "Nodule", "Mass",
            "Pneumothorax", "Pleural Effusion", "Cardiomegaly",
            "Pneumonia", "Atelectasis", "Fracture",
          ].map((tag) => (
            <div key={tag} className="flex items-center gap-2 px-3 py-2 bg-vuno-bg border border-vuno-border/60">
              <CheckCircle2 className="h-4 w-4 text-vuno-cyan flex-shrink-0" />
              <span className="text-sm text-white">{tag}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BottomCTA() {
  return (
    <section className="py-20 border-t border-vuno-divider">
      <div className="max-w-[900px] mx-auto px-6 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white">EMON CXR, 직접 사용해보세요</h2>
        <p className="mt-3 text-vuno-muted">데모 환자의 CXR 분석 결과를 즉시 확인할 수 있습니다.</p>
        <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
          <Link
            to="/demo/patient/042"
            className="inline-flex items-center gap-2 h-12 px-7 bg-vuno-cyan text-vuno-bg hover:bg-vuno-cyanGlow font-bold tracking-wider uppercase text-sm"
          >
            데모 보기 <ArrowUpRight className="h-4 w-4" />
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 h-12 px-7 border border-vuno-border text-white hover:bg-vuno-surface font-bold tracking-wider uppercase text-sm"
          >
            문의하기
          </Link>
        </div>
      </div>
    </section>
  );
}
