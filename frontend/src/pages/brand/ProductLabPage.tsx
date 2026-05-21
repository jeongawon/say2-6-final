import { Link } from "react-router-dom";
import { ArrowLeft, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { BrandShell } from "../../components/brand/BrandShell";
import { Reveal } from "../../components/brand/anim/Reveal";

export default function ProductLabPage() {
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
            <span className="text-vuno-cyan">EMON LAB</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold leading-tight text-white">
            EMON LAB<sup className="text-vuno-cyan text-2xl md:text-3xl">®</sup>
            <span className="text-vuno-cyan">™</span>
          </h1>

          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div>
              <div className="inline-flex items-center gap-2 text-vuno-cyan font-semibold mb-3">
                <span className="h-8 w-8 rounded-full border border-vuno-cyan/40 grid place-items-center text-xs">⚗</span>
                EMON LAB · DeepCARS Engine
              </div>
              <p className="text-xl text-white leading-relaxed">
                Troponin · CK-MB · WBC · CRP 등 응급 검사 항목을 통합 해석하고,
                시계열 트렌드로 급성 심근경색 · 패혈증 위험을 평가합니다.
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
            <CertBadge icon="⚗" title="AI 통합 검사값 해석 솔루션" />
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
        <Reveal className="mb-12 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-vuno-cyan/40 text-vuno-cyan text-xs font-bold uppercase tracking-[0.2em] mb-4">
            Ready to Support
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-white">
            시계열 검사값 통합 해석
          </h2>
          <p className="mt-4 text-vuno-muted leading-relaxed">
            응급실 환자의 LAB 결과를 시간 흐름에 따라 시각화하고, AI가 정상 범위 이탈과
            트렌드를 분석합니다. 단일 검사가 아닌 다중 검사 통합 해석으로 패혈증·심근경색을 조기 감지합니다.
          </p>
        </Reveal>

        <Reveal delay={200}>
          <DeepCarsScreen />
        </Reveal>
      </div>
    </section>
  );
}

function DeepCarsScreen() {
  return (
    <div className="border border-vuno-border bg-[#081427] shadow-2xl overflow-hidden">
      {/* 헤더 */}
      <div className="bg-vuno-bg px-4 py-2.5 border-b border-vuno-border flex items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 border border-vuno-cyan/60 bg-vuno-cyan/10">
          <span className="h-1.5 w-1.5 rounded-full bg-vuno-cyan animate-pulse" />
          <span className="text-[10px] font-bold text-vuno-cyan tracking-wider uppercase">EMON LAB · DeepCARS</span>
        </span>
        <span className="text-vuno-muted">PID W-0042 · 김OO M/52 · EMON Score</span>
        <span className="ml-auto text-vuno-cyan font-bold font-numeric text-sm">88</span>
      </div>

      {/* 비디오 영역 (16:9 비율 유지) */}
      <div className="relative aspect-video bg-black">
        <video
          src="/lab.mp4"
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* 하단 라벨 (다른 비디오 박스와 동일 스타일) */}
      <div className="px-4 py-2.5 bg-vuno-bg border-t border-vuno-border flex items-center justify-between text-xs">
        <span className="text-vuno-muted tracking-wider uppercase">Vital Trend · 6h Prediction</span>
        <span className="text-vuno-cyan font-bold tracking-wider uppercase text-[10px]">Real-time</span>
      </div>
    </div>
  );
}

function FeatureSection() {
  const features = [
    { num: "01", title: "시계열 트렌드 분석", desc: "단일 검사값이 아닌 시간 변화 추이로 패혈증·심근경색 조기 감지." },
    { num: "02", title: "다중 검사 통합 해석", desc: "Troponin · CK-MB · WBC · CRP 등을 통합해 단일 위험도 점수 산출." },
    { num: "03", title: "EMON Score",        desc: "0~100점으로 환자 임상 위험도를 표준화. 의료진 의사결정 보조." },
    { num: "04", title: "조기 경보",          desc: "Critical 임계값 돌파 시 의사·간호사에게 즉시 알림 (SNS/Push)." },
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
    { label: "AI 모델",          value: "XGBoost (DeepCARS v1.0)" },
    { label: "입력 형식",         value: "HL7 v2 · FHIR Observation · CSV" },
    { label: "추론 시간",         value: "평균 0.8초 (AWS Fargate 1vCPU/2GB)" },
    { label: "감지 패턴",         value: "Acute MI · Sepsis · Renal Failure · Hepatic Failure · Anemia" },
    { label: "EMON Score 범위",  value: "0–100 (높을수록 위험)" },
    { label: "정확도 (AUROC)",   value: "0.91 (MIMIC-IV 검증)" },
    { label: "출력",             value: "JSON + FHIR Observation · 시계열 차트 · 알람" },
    { label: "통합",             value: "EMON Orchestrator · HAPI FHIR · CloudWatch · SNS" },
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
            "Troponin I/T", "CK-MB", "BNP/NT-proBNP",
            "WBC", "CRP", "Procalcitonin",
            "Creatinine", "BUN", "AST/ALT",
            "Hemoglobin", "Platelet", "INR",
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
        <h2 className="text-3xl md:text-4xl font-bold text-white">EMON LAB, 직접 사용해보세요</h2>
        <p className="mt-3 text-vuno-muted">데모 환자의 LAB 트렌드를 즉시 확인할 수 있습니다.</p>
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
