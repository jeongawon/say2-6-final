import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import {
  Activity, Server, Database, AlertTriangle, CheckCircle2, ShieldCheck,
  Network, Boxes, RefreshCw, Cpu, Gauge, Brain,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { cn } from "../../lib/cn";
import { getModalHealth, getOpsMetrics, type OpsMetrics, type OpsPoint } from "../../lib/v2/api";

/* ─────────────────────────────────────────────────────────
   검진현황 → AWS 인프라 운영 모니터링 대시보드 (목업)
   monitoring-alarms-stack.yaml(알람 23개) 기준 시각화.
   배포 후 백엔드 /ops/alarms · /ops/metrics(CloudWatch) 연결 예정.
   ───────────────────────────────────────────────────────── */

const C = {
  indigo: "#6366f1", violet: "#8b5cf6", emerald: "#10b981",
  amber: "#f59e0b", red: "#ef4444", blue: "#3b82f6", slate: "#94a3b8",
};
const AXIS = { fontSize: 12, fill: C.slate };
const GRID = "#94a3b8";
const TOOLTIP = {
  contentStyle: { background: "#0f172a", border: "none", borderRadius: 8, fontSize: 11, padding: "6px 10px" },
  labelStyle: { color: "#cbd5e1", fontSize: 10 },
  itemStyle: { color: "#fff" },
};

/* 목업 시계열 생성 — base 주변 노이즈 + 옵션 트렌드 */
function mkSeries(points: number, base: number, amp: number, seed: number, opts?: { min?: number; max?: number; trend?: number }) {
  const now = Date.now();
  const out: { t: string; v: number }[] = [];
  for (let i = points - 1; i >= 0; i--) {
    const d = new Date(now - i * 5 * 60_000);
    const label = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const r = Math.sin((i + seed) / 2.3) * amp * 0.4 + (pseudo(i + seed) - 0.5) * amp;
    let v = base + r + (opts?.trend ? (points - i) * opts.trend : 0);
    if (opts?.min != null) v = Math.max(opts.min, v);
    if (opts?.max != null) v = Math.min(opts.max, v);
    out.push({ t: label, v: Math.round(v * 10) / 10 });
  }
  return out;
}
function pseudo(n: number) { const x = Math.sin(n * 99.13) * 43758.5453; return x - Math.floor(x); }
const last = (s: { v: number }[]) => s[s.length - 1]?.v ?? 0;

/* 실데이터(real)가 1점 이상이면 그걸, 아니면 mock 사용 */
function pick<T extends { v: number }[]>(real: OpsPoint[] | undefined, mock: T): OpsPoint[] | T {
  return real && real.length > 0 ? real : mock;
}
/* 여러 시리즈를 t 기준으로 병합 → [{t, [key]:v, ...}] (CloudWatch 시점 어긋남 대비) */
function mergeByT(...pairs: [string, OpsPoint[] | undefined][]): Record<string, number | string>[] {
  const map = new Map<string, Record<string, number | string>>();
  for (const [key, arr] of pairs) for (const p of arr ?? []) {
    const e = map.get(p.t) ?? { t: p.t };
    e[key] = p.v; map.set(p.t, e);
  }
  return [...map.values()];
}

type Sev = "critical" | "warning";
interface Alarm { sev: Sev; name: string; metric: string; value: string; threshold: string; since: string; }

export default function AdminDashboardPage() {
  const [seed, setSeed] = useState(0);
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  // 실제 AWS 서비스 상태 — /ops/health(CloudFront→ALB→orchestrator) 폴링.
  // orchestrator: 응답하면 up. ECG/CXR/LAB: 각 모달 추론 서버 up/down.
  const [health, setHealth] = useState<{ orchestrator: boolean; ecg: boolean; cxr: boolean; lab: boolean }>(
    { orchestrator: true, ecg: true, cxr: true, lab: true },
  );
  // 실제 CloudWatch 메트릭 (/ops/metrics) — 있으면 차트/상태를 실데이터로 대체
  const [metrics, setMetrics] = useState<OpsMetrics | null>(null);

  const refreshHealth = async () => {
    const h = await getModalHealth();
    // 응답을 못 받으면(네트워크/프록시 미연결) 다운으로 단정하지 않고 직전 상태 유지 → 거짓 '위험' 방지
    if (h) setHealth({ orchestrator: true, ecg: !!h.ECG, cxr: !!h.CXR, lab: !!h.LAB });
    const m = await getOpsMetrics();
    if (m && !m.error) setMetrics(m);
  };

  // 30초 자동 갱신 — 실제 health/metrics 폴링 + 차트 갱신
  useEffect(() => {
    refreshHealth();
    const id = window.setInterval(() => { setSeed((s) => s + 1); setUpdatedAt(new Date()); refreshHealth(); }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const d = useMemo(() => {
    const ms = metrics?.services ?? [];
    const svc = (k: string) => ms.find((s) => s.key === k);
    // 태스크 표기: 실제 CloudWatch/ECS running/desired 우선, 없으면 /ops/health 기반
    const tasksOf = (k: string, hUp: boolean, des: number) => {
      const r = svc(k);
      if (r && r.running != null && r.desired != null) return `${r.running}/${r.desired}`;
      return hUp ? `${des}/${des}` : `0/${des}`;
    };
    // ECS 4개 서비스 — CPU/MEM 실데이터 우선
    const services = [
      { key: "orchestrator", label: "AI 에이전트", tasks: tasksOf("orchestrator", health.orchestrator, 2), cpu: pick(svc("orchestrator")?.cpu, mkSeries(24, 58, 22, seed, { min: 5, max: 99 })), mem: pick(svc("orchestrator")?.mem, mkSeries(24, 64, 16, seed + 5, { min: 5, max: 99 })) },
      { key: "ecg", label: "ECG 추론", tasks: tasksOf("ecg", health.ecg, 1), cpu: pick(svc("ecg")?.cpu, mkSeries(24, 41, 30, seed + 2, { min: 3, max: 99 })), mem: pick(svc("ecg")?.mem, mkSeries(24, 55, 18, seed + 7, { min: 5, max: 99 })) },
      { key: "cxr", label: "CXR 추론", tasks: tasksOf("cxr", health.cxr, 1), cpu: pick(svc("cxr")?.cpu, mkSeries(24, 49, 28, seed + 3, { min: 3, max: 99 })), mem: pick(svc("cxr")?.mem, mkSeries(24, 70, 14, seed + 8, { min: 5, max: 99 })) },
      { key: "lab", label: "LAB 추론", tasks: tasksOf("lab", health.lab, 1), cpu: pick(svc("lab")?.cpu, mkSeries(24, 22, 14, seed + 4, { min: 2, max: 99 })), mem: pick(svc("lab")?.mem, mkSeries(24, 38, 12, seed + 9, { min: 5, max: 99 })) },
    ];
    // ALB — 실데이터 우선
    const albReq = pick(metrics?.alb?.req, mkSeries(24, 320, 120, seed + 11, { min: 0 }));
    const alb5xx = ((metrics?.alb?.elb5xx?.length ?? 0) > 0 || (metrics?.alb?.tgt5xx?.length ?? 0) > 0)
      ? mergeByT(["elb", metrics!.alb.elb5xx], ["tgt", metrics!.alb.tgt5xx]).map((p) => ({ ...p, elb: Number(p.elb ?? 0), tgt: Number(p.tgt ?? 0) }))
      : mkSeries(24, 2, 4, seed + 12, { min: 0 }).map((p) => ({ ...p, elb: Math.max(0, Math.round(p.v)), tgt: Math.max(0, Math.round(pseudo(p.v + seed) * 3)) }));
    const albLat = (metrics?.alb?.p99?.length ?? 0) > 0
      ? mergeByT(["p50", metrics!.alb.p50], ["p90", metrics!.alb.p90], ["p99", metrics!.alb.p99]).map((p) => ({ t: p.t as string, p50: Number(p.p50 ?? 0), p90: Number(p.p90 ?? 0), p99: Number(p.p99 ?? 0) }))
      : mkSeries(24, 0.9, 0.5, seed + 13, { min: 0.1 }).map((p) => ({ t: p.t, p50: p.v, p90: +(p.v * 1.8).toFixed(2), p99: +(p.v * 3.1).toFixed(2) }));
    // Aurora — 실데이터 우선
    const aurCpu = pick(metrics?.aurora?.cpu, mkSeries(24, 44, 20, seed + 21, { min: 3, max: 99 }));
    const aurAcu = pick(metrics?.aurora?.acu, mkSeries(24, 1.8, 0.9, seed + 22, { min: 0.5, max: 4 }));
    const aurConn = pick(metrics?.aurora?.conn, mkSeries(24, 62, 28, seed + 23, { min: 0 }));
    const aurMem = pick(metrics?.aurora?.mem, mkSeries(24, 900, 240, seed + 24, { min: 200 })); // MB
    // 모달 추론/FHIR — 커스텀 메트릭(추세 표시)
    const modalErr = [
      { m: "ECG", v: Math.round(pseudo(seed + 1) * 3) },
      { m: "CXR", v: Math.round(pseudo(seed + 2) * 2) },
      { m: "LAB", v: 0 },
    ];
    const modalLat = mkSeries(24, 1.4, 0.8, seed + 31, { min: 0.2 });
    const fhirQ = mkSeries(24, 34, 26, seed + 32, { min: 0, trend: 0.4 });

    // 활성 알람 — CloudWatch 실제 알람(있으면) + 서비스 다운 기반 critical
    const alarms: Alarm[] = [];
    for (const a of metrics?.alarms ?? []) {
      alarms.push({ sev: a.sev, name: a.name, metric: a.metric || "CloudWatch Alarm", value: a.value || "ALARM", threshold: a.threshold || "", since: a.since || "" });
    }
    const seen = new Set(alarms.map((a) => a.name));
    const downMap: [boolean, string, string][] = [
      [!health.orchestrator, "say2-6team-orchestrator-down", "AI 에이전트(orchestrator)"],
      [!health.ecg, "say2-6team-ecg-svc-down", "ECG 추론 서비스"],
      [!health.cxr, "say2-6team-cxr-svc-down", "CXR 추론 서비스"],
      [!health.lab, "say2-6team-lab-svc-down", "LAB 추론 서비스"],
    ];
    for (const [down, name, label] of downMap) {
      if (down && !seen.has(name)) alarms.push({ sev: "critical", name, metric: `${label} HealthCheck`, value: "DOWN", threshold: "UP 기대", since: "방금" });
    }

    return { services, albReq, alb5xx, albLat, aurCpu, aurAcu, aurConn, aurMem, modalErr, modalLat, fhirQ, alarms };
  }, [seed, health, metrics]);

  const critCount = d.alarms.filter((a) => a.sev === "critical").length;
  const warnCount = d.alarms.filter((a) => a.sev === "warning").length;
  const overall: Sev | "ok" = critCount > 0 ? "critical" : warnCount > 0 ? "warning" : "ok";
  const runningTasks = d.services.reduce((n, s) => n + Number(s.tasks.split("/")[0]), 0);
  const desiredTasks = d.services.reduce((n, s) => n + Number(s.tasks.split("/")[1]), 0);

  return (
    <AppShell notifications={critCount + warnCount}>
      <div className="bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white min-h-[calc(100vh-3.5rem)]">
        <div className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">

          {/* 헤더 */}
          <div className="flex items-end gap-3">
            <h1 className="text-[28px] font-bold text-slate-900 dark:text-white flex items-center gap-2.5">
              <Server className="h-8 w-8 text-brand-600" /> 운영 모니터링
            </h1>
            <div className="ml-auto flex items-center gap-2.5 text-[15px] text-slate-500 dark:text-vuno-muted">
              <span className="font-numeric">{fmtClock(updatedAt)} 갱신</span>
              <button
                onClick={() => { setSeed((s) => s + 1); setUpdatedAt(new Date()); refreshHealth(); }}
                className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-slate-300 dark:border-vuno-border bg-white dark:bg-vuno-surface hover:bg-slate-50 dark:hover:bg-vuno-elevated font-bold transition-colors text-[15px]"
              >
                <RefreshCw className="h-4 w-4" /> 새로고침
              </button>
            </div>
          </div>

          {/* ① KPI */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              Icon={overall === "ok" ? ShieldCheck : AlertTriangle}
              label="시스템 종합 상태"
              value={overall === "ok" ? "정상" : overall === "warning" ? "주의" : "위험"}
              tone={overall === "ok" ? "emerald" : overall === "warning" ? "amber" : "red"}
            />
            <KpiCard Icon={AlertTriangle} label="활성 알람" value={`${critCount} · ${warnCount}`} tone={critCount ? "red" : warnCount ? "amber" : "emerald"} />
            <KpiCard Icon={Boxes} label="실행 중 태스크" value={`${runningTasks}/${desiredTasks}`} tone={runningTasks < desiredTasks ? "red" : "indigo"} />
            <KpiCard Icon={Gauge} label="ALB p99 응답" value={`${last(d.albLat.map((x) => ({ v: x.p99 })))}s`} sub="임계 3s" tone="blue" />
          </div>

          {/* ② 활성 알람 */}
          <Panel title="활성 알람" subtitle="Active Alarms · SNS critical/warning" icon={AlertTriangle}>
            {d.alarms.length === 0 ? (
              <div className="py-8 text-center text-sm text-emerald-600 dark:text-emerald-300 flex items-center justify-center gap-2">
                <CheckCircle2 className="h-5 w-5" /> 활성 알람 없음 — 전체 정상
              </div>
            ) : (
              <div className="space-y-1.5">
                {d.alarms.map((a) => <AlarmRow key={a.name} a={a} />)}
              </div>
            )}
          </Panel>

          {/* ③ ECS 서비스 */}
          <Panel title="ECS 서비스" subtitle="Fargate · CPU / Memory / Tasks" icon={Cpu}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
              {d.services.map((s) => <ServiceCard key={s.key} s={s} />)}
            </div>
          </Panel>

          {/* ④ ALB / 트래픽 */}
          <Panel title="ALB · 트래픽" subtitle="Application Load Balancer" icon={Network}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartBox title="요청 수 (RequestCount)" value={`${Math.round(last(d.albReq))}/min`}>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={d.albReq} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="gReq" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.indigo} stopOpacity={0.35} /><stop offset="100%" stopColor={C.indigo} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke={GRID} strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="t" tick={AXIS} interval={5} tickLine={false} axisLine={false} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} />
                    <Tooltip {...TOOLTIP} />
                    <Area type="monotone" dataKey="v" name="req/min" stroke={C.indigo} fill="url(#gReq)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox title="5xx 오류 (ELB + Target)" value={`임계 >10`}>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={d.alb5xx} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="t" tick={AXIS} interval={5} tickLine={false} axisLine={false} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} />
                    <Tooltip {...TOOLTIP} />
                    <ReferenceLine y={10} stroke={C.red} strokeDasharray="4 4" />
                    <Bar dataKey="elb" name="ELB 5xx" stackId="a" fill={C.amber} />
                    <Bar dataKey="tgt" name="Target 5xx" stackId="a" fill={C.red} radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox title="응답시간 p50/p90/p99" value={`p99 ${last(d.albLat.map((x) => ({ v: x.p99 })))}s`}>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={d.albLat} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="t" tick={AXIS} interval={5} tickLine={false} axisLine={false} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} />
                    <Tooltip {...TOOLTIP} />
                    <ReferenceLine y={3} stroke={C.red} strokeDasharray="4 4" />
                    <Line type="monotone" dataKey="p50" stroke={C.emerald} dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="p90" stroke={C.amber} dot={false} strokeWidth={1.5} />
                    <Line type="monotone" dataKey="p99" stroke={C.red} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBox>
            </div>
          </Panel>

          {/* ⑤ Aurora */}
          <Panel title="Aurora Serverless v2" subtitle="RDS · CPU / ACU / Connections / Memory" icon={Database}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <MiniLine title="CPU 사용률" data={d.aurCpu} unit="%" color={C.indigo} threshold={80} />
              <MiniLine title="용량 (ACU)" data={d.aurAcu} unit="" color={C.violet} threshold={3.6} />
              <MiniLine title="DB 커넥션" data={d.aurConn} unit="" color={C.blue} threshold={100} />
              <MiniLine title="가용 메모리" data={d.aurMem} unit="MB" color={C.emerald} threshold={256} thresholdBelow />
            </div>
          </Panel>

          {/* ⑥ AI 모달 추론 + FHIR Sync */}
          <Panel title="AI 모달 추론 · FHIR Sync" subtitle="DRAI/Modal · DRAI/FhirSync (커스텀 메트릭)" icon={Brain}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <ChartBox title="모달별 추론 에러 수" value="임계 ≥3">
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={d.modalErr} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="m" tick={AXIS} tickLine={false} axisLine={false} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
                    <Tooltip {...TOOLTIP} />
                    <ReferenceLine y={3} stroke={C.red} strokeDasharray="4 4" />
                    <Bar dataKey="v" name="errors" radius={[3, 3, 0, 0]}>
                      {d.modalErr.map((e) => <Cell key={e.m} fill={e.v >= 3 ? C.red : C.violet} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox title="추론 고지연 (HighLatency)" value={`${last(d.modalLat)}s`}>
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={d.modalLat} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={GRID} strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="t" tick={AXIS} interval={5} tickLine={false} axisLine={false} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} />
                    <Tooltip {...TOOLTIP} />
                    <Line type="monotone" dataKey="v" name="지연(s)" stroke={C.amber} dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </ChartBox>

              <ChartBox title="FHIR Sync 큐 적체" value={`${Math.round(last(d.fhirQ))} · 임계 >100`}>
                <ResponsiveContainer width="100%" height={150}>
                  <AreaChart data={d.fhirQ} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
                    <defs><linearGradient id="gQ" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.blue} stopOpacity={0.35} /><stop offset="100%" stopColor={C.blue} stopOpacity={0} /></linearGradient></defs>
                    <CartesianGrid stroke={GRID} strokeOpacity={0.15} vertical={false} />
                    <XAxis dataKey="t" tick={AXIS} interval={5} tickLine={false} axisLine={false} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={32} />
                    <Tooltip {...TOOLTIP} />
                    <ReferenceLine y={100} stroke={C.red} strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="v" name="queue" stroke={C.blue} fill="url(#gQ)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </ChartBox>
            </div>
          </Panel>

          <p className="text-[13px] text-slate-400 dark:text-vuno-dim text-center pb-2">
            ⓘ 서비스 상태·활성 알람은 <span className="font-numeric">/ops/health</span> 실시간 연동입니다. CPU·메모리·트래픽 시계열은 추세 표시이며, CloudWatch 메트릭 연동 시 실수치로 대체됩니다.
          </p>
        </div>
      </div>
    </AppShell>
  );
}

/* ── 시계 ── */
function fmtClock(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

/* ── 톤 ── */
const TONE: Record<string, { bg: string; text: string; icon: string }> = {
  emerald: { bg: "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-200 dark:border-emerald-500/40", text: "text-emerald-700 dark:text-emerald-300", icon: "text-emerald-500" },
  amber: { bg: "bg-amber-50 dark:bg-amber-500/15 border-amber-200 dark:border-amber-500/40", text: "text-amber-700 dark:text-amber-300", icon: "text-amber-500" },
  red: { bg: "bg-red-50 dark:bg-red-500/15 border-red-200 dark:border-red-500/40", text: "text-red-700 dark:text-red-300", icon: "text-red-500" },
  blue: { bg: "bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/40", text: "text-blue-700 dark:text-blue-300", icon: "text-blue-500" },
  indigo: { bg: "bg-brand-50 dark:bg-brand-500/15 border-brand-200 dark:border-brand-500/40", text: "text-brand-700 dark:text-brand-300", icon: "text-brand-500" },
};

function KpiCard({ Icon, label, value, sub, tone }: {
  Icon: typeof Server; label: string; value: string; sub?: string; tone: keyof typeof TONE;
}) {
  const t = TONE[tone];
  return (
    <div className={cn("border rounded-xl shadow-sm px-4 py-3.5 flex items-center justify-between", t.bg)}>
      <div className="min-w-0">
        <div className="text-[14px] text-slate-500 dark:text-vuno-muted mb-1">{label}</div>
        <div className={cn("text-[30px] font-bold font-numeric leading-none", t.text)}>{value}</div>
        {sub && <div className="text-[12px] text-slate-400 dark:text-vuno-dim mt-1">{sub}</div>}
      </div>
      <Icon className={cn("h-9 w-9 flex-shrink-0", t.icon)} />
    </div>
  );
}

function Panel({ title, subtitle, icon: Icon, children }: {
  title: string; subtitle: string; icon?: typeof Server; children: React.ReactNode;
}) {
  return (
    <section className="bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden">
      <header className="px-5 py-3.5 border-b border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg flex items-center gap-2.5">
        {Icon && <Icon className="h-6 w-6 text-slate-600 dark:text-vuno-muted" />}
        {/* 영문 부제 제거 — 한글 제목만 크게 */}
        <div className="text-[19px] font-bold text-slate-900 dark:text-white leading-none">{title}</div>
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function AlarmRow({ a }: { a: Alarm }) {
  const t = a.sev === "critical" ? TONE.red : TONE.amber;
  return (
    <div className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg border", t.bg)}>
      <span className={cn("px-2 py-1 rounded text-[12px] font-bold uppercase", a.sev === "critical" ? "bg-red-600 text-white" : "bg-amber-500 text-white")}>
        {a.sev}
      </span>
      <div className="min-w-0 flex-1">
        <div className={cn("text-[15px] font-bold font-numeric truncate", t.text)}>{a.name}</div>
        <div className="text-[13px] text-slate-500 dark:text-vuno-muted truncate">{a.metric} · 현재 {a.value} ({a.threshold})</div>
      </div>
      <span className="text-[13px] text-slate-400 dark:text-vuno-dim flex-shrink-0">{a.since}</span>
    </div>
  );
}

function ServiceCard({ s }: {
  s: { key: string; label: string; tasks: string; cpu: { t: string; v: number }[]; mem: { t: string; v: number }[] };
}) {
  const cpu = last(s.cpu), mem = last(s.mem);
  const [run, des] = s.tasks.split("/").map(Number);
  const ok = run >= des;
  return (
    <div className="border border-slate-200 dark:border-vuno-border rounded-xl bg-slate-50/60 dark:bg-vuno-bg overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface">
        <Activity className="h-3.5 w-3.5 text-brand-500" />
        <span className="text-[15px] font-bold text-slate-900 dark:text-white">{s.label}</span>
        <span className={cn(
          "ml-auto px-2 py-0.5 rounded text-[12px] font-bold",
          ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
        )}>
          {ok ? "정상" : "다운"} {s.tasks}
        </span>
      </div>
      <div className="p-3 space-y-2">
        <UsageBar label="CPU" value={cpu} />
        <UsageBar label="MEM" value={mem} />
        <ResponsiveContainer width="100%" height={42}>
          <AreaChart data={s.cpu} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
            <defs><linearGradient id={`sp-${s.key}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={C.indigo} stopOpacity={0.3} /><stop offset="100%" stopColor={C.indigo} stopOpacity={0} /></linearGradient></defs>
            <Area type="monotone" dataKey="v" stroke={C.indigo} fill={`url(#sp-${s.key})`} strokeWidth={1.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function UsageBar({ label, value }: { label: string; value: number }) {
  const tone = value >= 85 ? C.red : value >= 70 ? C.amber : C.indigo;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-bold text-slate-400 dark:text-vuno-dim w-9">{label}</span>
      <div className="flex-1 h-2.5 rounded-full bg-slate-200 dark:bg-vuno-elevated overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: tone }} />
      </div>
      <span className="text-[14px] font-numeric font-bold text-slate-700 dark:text-white w-12 text-right">{value}%</span>
    </div>
  );
}

function ChartBox({ title, value, children }: { title: string; value?: string; children: React.ReactNode }) {
  return (
    <div className="border border-slate-200 dark:border-vuno-border rounded-xl p-3 bg-slate-50/40 dark:bg-vuno-bg/40">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[14px] font-bold text-slate-700 dark:text-slate-200">{title}</span>
        {value && <span className="ml-auto text-[13px] font-numeric text-slate-400 dark:text-vuno-dim">{value}</span>}
      </div>
      {children}
    </div>
  );
}

function MiniLine({ title, data, unit, color, threshold, thresholdBelow }: {
  title: string; data: { t: string; v: number }[]; unit: string; color: string; threshold: number; thresholdBelow?: boolean;
}) {
  const cur = last(data);
  const breach = thresholdBelow ? cur < threshold : cur > threshold;
  return (
    <div className="border border-slate-200 dark:border-vuno-border rounded-xl p-3 bg-slate-50/40 dark:bg-vuno-bg/40">
      <div className="flex items-baseline gap-2 mb-1.5">
        <span className="text-[14px] font-bold text-slate-700 dark:text-slate-200">{title}</span>
        <span className={cn("ml-auto text-[15px] font-numeric font-bold", breach ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-white")}>
          {cur}{unit}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={110}>
        <LineChart data={data} margin={{ top: 4, right: 6, left: -22, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="t" tick={AXIS} interval={7} tickLine={false} axisLine={false} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={34} />
          <Tooltip {...TOOLTIP} />
          <ReferenceLine y={threshold} stroke={C.red} strokeDasharray="4 4" />
          <Line type="monotone" dataKey="v" name={title} stroke={color} dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
