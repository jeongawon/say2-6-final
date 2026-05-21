import { Activity, FlaskConical, Image as ImageIcon, Sparkles, AlertCircle } from "lucide-react";

/**
 * VUNO 스타일 isometric 모자이크
 * ECG · CXR · LAB · Worklist · AI 권고 화면을 입체적으로 합성
 */
export function ModalityMosaic() {
  return (
    <div className="relative w-full aspect-[5/4] select-none">
      {/* 글로우 백드롭 */}
      <div className="absolute inset-0 bg-vuno-cyan/10 blur-3xl rounded-full" />
      <div className="absolute inset-8 bg-vuno-cyan/15 blur-2xl rounded-full" />

      {/* Isometric 컨테이너 */}
      <div
        className="absolute inset-0"
        style={{
          perspective: "1400px",
          perspectiveOrigin: "50% 50%",
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            transformStyle: "preserve-3d",
            transform: "rotateX(12deg) rotateY(-18deg) rotateZ(4deg)",
          }}
        >
          {/* CXR — 가장 큰 메인 카드 (중앙) */}
          <Card className="absolute top-[18%] left-[14%] w-[58%] z-20 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)]">
            <CardHeader title="CXR · Chest X-Ray" />
            <div className="p-3 bg-black relative">
              <svg viewBox="0 0 200 140" className="w-full">
                {/* 흉곽 라인 */}
                <ellipse cx="100" cy="70" rx="80" ry="55" fill="none" stroke="#94A3B8" strokeWidth="0.5" opacity="0.4" />
                <path d="M 30 70 Q 60 30, 100 30 Q 140 30, 170 70 Q 140 110, 100 110 Q 60 110, 30 70" fill="none" stroke="#CBD5E1" strokeWidth="0.8" opacity="0.5" />
                {/* 폐 */}
                <ellipse cx="65" cy="70" rx="22" ry="35" fill="#1E293B" stroke="#64748B" strokeWidth="0.4" />
                <ellipse cx="135" cy="70" rx="22" ry="35" fill="#1E293B" stroke="#64748B" strokeWidth="0.4" />
                {/* 척추 */}
                <line x1="100" y1="30" x2="100" y2="110" stroke="#475569" strokeWidth="1" />
                {/* 갈비뼈 */}
                {[40, 55, 70, 85, 100].map((y) => (
                  <path key={y} d={`M 30 ${y} Q 100 ${y - 5}, 170 ${y}`} fill="none" stroke="#64748B" strokeWidth="0.3" opacity="0.6" />
                ))}
                {/* 히트맵 (이상 부위) */}
                <circle cx="125" cy="78" r="14" fill="url(#heatmap)" opacity="0.9" />
                <defs>
                  <radialGradient id="heatmap">
                    <stop offset="0%" stopColor="#EF4444" />
                    <stop offset="40%" stopColor="#F59E0B" />
                    <stop offset="80%" stopColor="#FBBF24" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#FBBF24" stopOpacity="0" />
                  </radialGradient>
                </defs>
              </svg>
              <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-red-500 text-[8px] font-bold text-white tracking-wider">
                Cons 32%
              </div>
              <div className="absolute top-2 left-2 text-[8px] font-bold text-vuno-cyan tracking-wider">R</div>
            </div>
            <CardFooter accent="ABNORMAL · 89%" tone="critical" />
          </Card>

          {/* ECG — 좌상단 */}
          <Card className="absolute top-0 left-0 w-[36%] z-30 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)]">
            <CardHeader title="ECG · 12-Lead" />
            <div className="p-2 bg-black">
              {["I", "II", "III", "V2"].map((lead, i) => (
                <div key={lead} className="flex items-center gap-1.5 mb-1">
                  <span className="text-[8px] text-vuno-cyan font-bold w-4 font-numeric">{lead}</span>
                  <svg viewBox="0 0 100 12" className="flex-1 h-2.5">
                    <path
                      d={i === 3
                        ? "M0,6 L10,6 L13,2 L16,10 L19,1 L25,6 L40,6 L43,2 L46,10 L49,1 L55,6 L70,6 L73,2 L76,10 L79,1 L85,6 L100,6"
                        : "M0,6 L10,6 L13,4 L16,8 L19,3 L25,6 L40,6 L43,4 L46,8 L49,3 L55,6 L70,6 L73,4 L76,8 L79,3 L85,6 L100,6"}
                      stroke={i === 3 ? "#EF4444" : "#22C55E"}
                      strokeWidth="0.5"
                      fill="none"
                    />
                  </svg>
                </div>
              ))}
              <div className="grid grid-cols-2 gap-1 mt-2 pt-1.5 border-t border-vuno-border/30">
                <Metric label="HR" value="88" />
                <Metric label="QRS" value="95ms" />
              </div>
            </div>
            <CardFooter accent="STEMI 의심" tone="critical" />
          </Card>

          {/* LAB — 우상단 */}
          <Card className="absolute top-[4%] right-0 w-[34%] z-25 shadow-[0_20px_40px_-10px_rgba(0,0,0,0.6)]">
            <CardHeader title="LAB · Chemistry" />
            <div className="p-2 bg-vuno-bg">
              {[
                { name: "Troponin", val: "0.82", high: true },
                { name: "CK-MB",    val: "12.4", high: true },
                { name: "WBC",      val: "10.2", high: true },
                { name: "Glucose",  val: "112",  high: false },
                { name: "Cr",       val: "0.9",  high: false },
              ].map((r) => (
                <div key={r.name} className="flex items-center justify-between py-0.5 border-b border-vuno-border/20 last:border-0">
                  <span className="text-[8px] text-vuno-muted">{r.name}</span>
                  <span className={"text-[9px] font-numeric font-bold " + (r.high ? "text-red-400" : "text-white")}>
                    {r.val}{r.high && " ↑"}
                  </span>
                </div>
              ))}
            </div>
            <CardFooter accent="Acute MI 의심" tone="critical" />
          </Card>

          {/* Worklist — 좌하단 */}
          <Card className="absolute bottom-[2%] left-[6%] w-[40%] z-15 shadow-[0_25px_50px_-15px_rgba(0,0,0,0.7)]">
            <CardHeader title="WORKLIST · 응급실" />
            <div className="p-2 bg-vuno-bg">
              {[
                { id: "042", name: "김OO", tone: "critical" as const, dot: "bg-red-500" },
                { id: "041", name: "이OO", tone: "urgent" as const,   dot: "bg-amber-500" },
                { id: "040", name: "박OO", tone: "normal" as const,   dot: "bg-emerald-500" },
              ].map((p, i) => (
                <div key={p.id} className={"flex items-center gap-2 px-2 py-1.5 mb-0.5 border " + (i === 0 ? "border-red-500/50 bg-red-500/10" : "border-vuno-border bg-vuno-surface")}>
                  <span className={"h-1.5 w-1.5 rounded-full " + p.dot} />
                  <span className="text-[8px] font-numeric text-vuno-cyan font-bold">#{p.id}</span>
                  <span className="text-[9px] text-white">{p.name}</span>
                  <span className="ml-auto text-[7px] text-vuno-muted tracking-wider uppercase">{p.tone}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* AI 권고 — 우하단 (가장 앞) */}
          <Card className="absolute bottom-0 right-[4%] w-[38%] z-40 shadow-[0_30px_60px_-20px_rgba(33,212,212,0.4)]" cyan>
            <div className="bg-gradient-to-r from-vuno-cyan/20 to-vuno-cyan/5 px-3 py-1.5 border-b border-vuno-cyan/40 flex items-center gap-1.5">
              <Sparkles className="h-2.5 w-2.5 text-vuno-cyan" />
              <span className="text-[9px] font-bold text-vuno-cyan tracking-[0.15em] uppercase">AI 종합 판정</span>
            </div>
            <div className="p-3 bg-vuno-bg">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertCircle className="h-3 w-3 text-red-400" />
                <span className="text-[10px] font-bold text-red-400 tracking-wider uppercase">Critical</span>
              </div>
              <div className="text-[11px] font-bold text-white leading-tight">
                STEMI (anterior wall)
              </div>
              <div className="text-[8px] text-vuno-muted mt-1 leading-snug">
                심혈관조영술 즉시 권고
              </div>
              <div className="mt-2 h-1 bg-vuno-border overflow-hidden">
                <div className="h-full bg-vuno-cyan" style={{ width: "92%" }} />
              </div>
              <div className="text-[8px] text-vuno-cyan font-numeric mt-0.5">신뢰도 92%</div>
            </div>
          </Card>
        </div>
      </div>

      {/* 우하단 모달 아이콘 줄 (VUNO Med 같은 느낌) */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1.5 px-3 py-2 bg-vuno-bg/80 backdrop-blur border border-vuno-border z-50">
        <span className="text-[9px] font-bold text-vuno-cyan tracking-[0.2em] uppercase pr-2 border-r border-vuno-border">EMON</span>
        <IconChip icon={Activity} />
        <IconChip icon={ImageIcon} />
        <IconChip icon={FlaskConical} />
        <IconChip icon={Sparkles} />
      </div>
    </div>
  );
}

function Card({
  children, className, cyan,
}: { children: React.ReactNode; className?: string; cyan?: boolean }) {
  return (
    <div
      className={
        "border bg-vuno-surface overflow-hidden " +
        (cyan ? "border-vuno-cyan/60" : "border-vuno-border") +
        " " + (className ?? "")
      }
    >
      {children}
    </div>
  );
}

function CardHeader({ title }: { title: string }) {
  return (
    <div className="bg-vuno-bg px-2.5 py-1.5 border-b border-vuno-border flex items-center gap-1.5">
      <div className="flex gap-1">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500/60" />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500/60" />
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" />
      </div>
      <span className="text-[9px] font-bold text-vuno-cyan tracking-[0.15em] uppercase ml-1">{title}</span>
    </div>
  );
}

function CardFooter({ accent, tone }: { accent: string; tone: "critical" | "normal" }) {
  return (
    <div className="bg-vuno-bg px-2.5 py-1.5 border-t border-vuno-border flex items-center justify-between">
      <span className="text-[8px] text-vuno-muted tracking-wider uppercase">Result</span>
      <span className={"text-[9px] font-bold tracking-wider " + (tone === "critical" ? "text-red-400" : "text-emerald-400")}>
        {accent}
      </span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-vuno-bg border border-vuno-border/40 px-1.5 py-0.5">
      <div className="text-[7px] text-vuno-muted uppercase tracking-wider">{label}</div>
      <div className="text-[9px] font-numeric font-bold text-vuno-cyan">{value}</div>
    </div>
  );
}

function IconChip({ icon: Icon }: { icon: typeof Activity }) {
  return (
    <div className="h-6 w-6 border border-vuno-border bg-vuno-surface grid place-items-center text-vuno-cyan hover:border-vuno-cyan transition-colors">
      <Icon className="h-3 w-3" />
    </div>
  );
}
