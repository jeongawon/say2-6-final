import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Rocket, RotateCcw, Mic, MicOff, Trash2, Wand2, Sparkles, User, HeartPulse,
  MessageCircle, Flame, History, ChevronRight,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { cn } from "../../lib/cn";
import { KTAS_META, type KTAS, type Sex, PAST_HISTORY_LABELS, type PastHistoryCode, type ChiefComplaint } from "../../types/triage";
import {
  DEMO_PATIENTS, getLivePatients, isLivePatient, registerLivePatient,
  setCurrentPatientId, getLocalReportStatus, type DemoPatient,
} from "../../lib/v2/demoStore";
import { submitTriage, listEncounters, type ReportStatus } from "../../lib/v2/api";
import { useSpeechRecognition } from "../../lib/v2/speech";
import { parseTriageSpeech } from "../../lib/v2/triageVoiceParse";

/* ─────────────────────────────────────────────────────────
   환자정보입력 (Triage) — 3단: 좌 접수 대기열 / 중앙 입력 폼 / 우 환자 목록
   좌·우 사이드바 sticky 고정, 중앙 폼만 스크롤. 라이트 기본 + 다크.
   ───────────────────────────────────────────────────────── */

const PAST_HX_CODES: PastHistoryCode[] = ["HTN", "DM", "CAD", "CVA", "COPD", "ASTHMA", "CKD", "AFIB"];
const KTAS_OPTS: { k: KTAS; en: string; t: string }[] = [
  { k: 1, en: "Resuscitation", t: "즉시" }, { k: 2, en: "Emergent", t: "15분" },
  { k: 3, en: "Urgent", t: "30분" }, { k: 4, en: "Less Urgent", t: "1h" }, { k: 5, en: "Non-Urgent", t: "2h" },
];

function regNo(p: DemoPatient): string {
  return p.mimic?.subject_id ?? p.mrn ?? p.id.slice(0, 8);
}
function examOf(p: DemoPatient): "done" | "analyzing" | "waiting" {
  return p.aiStatus === "done" ? "done" : p.aiStatus === "analyzing" ? "analyzing" : "waiting";
}
function patientHref(p: DemoPatient): string {
  const q = isLivePatient(p.id) ? `?encounter_id=${p.id}` : "";
  return examOf(p) === "done" ? `/demo/patient/${p.id}/report${q}` : `/demo/patient/${p.id}${q}`;
}
// 환자 목록 상태 — 검사대기 / 검사완료 / 소견완료 셋 중 하나.
// backendReport: /encounters/list 의 report_status (실시간). 있으면 우선, 없으면 로컬/aiStatus.
function statusOf(p: DemoPatient, backendReport?: ReportStatus | null): { label: string; cls: string } {
  const rep = backendReport ?? getLocalReportStatus(p.id);
  if (rep === "signed" || rep === "amended")
    return { label: "소견완료", cls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/40" };
  if (rep === "preliminary" || rep === "reviewed" || p.aiStatus === "done")
    return { label: "검사완료", cls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/40" };
  return { label: "검사대기", cls: "bg-slate-100 text-slate-500 border-slate-200 dark:bg-vuno-bg dark:text-vuno-muted dark:border-vuno-border" };
}
function hhmm(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

// 접수 대기열을 채우는 mock 환자들 — 핵심 테스트 케이스(DEMO_CASES_4) 아래로 붙어 큐를 채운다.
// 클릭 시 폼이 자동으로 채워진다(데모용). 실제 백엔드 라우팅은 핵심 케이스만 사용.
const mqTime = (min: number) => new Date(Date.now() - min * 60000).toISOString();
const MOCK_QUEUE: DemoPatient[] = [
  { id: "Q-101", mrn: "M2026-1101", name: "최영호", age: 58, sex: "M", ktas: 2, chief: "갑작스러운 어지럼과 좌측 팔 위약", registeredAt: mqTime(3),  arrivedAt: mqTime(4),  ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 162, dbp: 98, hr: 90,  rr: 18, spo2: 96, bt: 36.7 } },
  { id: "Q-102", mrn: "M2026-1102", name: "한지민", age: 41, sex: "F", ktas: 3, chief: "발열·기침 3일째",            registeredAt: mqTime(7),  arrivedAt: mqTime(9),  ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 118, dbp: 74, hr: 98,  rr: 20, spo2: 97, bt: 38.4 } },
  { id: "Q-103", mrn: "M2026-1103", name: "오세훈", age: 67, sex: "M", ktas: 2, chief: "호흡곤란 악화",              registeredAt: mqTime(11), arrivedAt: mqTime(13), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 138, dbp: 84, hr: 104, rr: 26, spo2: 90, bt: 36.9 } },
  { id: "Q-104", mrn: "M2026-1104", name: "윤서연", age: 29, sex: "F", ktas: 4, chief: "복통·구토",                registeredAt: mqTime(15), arrivedAt: mqTime(17), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 112, dbp: 70, hr: 88,  rr: 16, spo2: 99, bt: 37.1 } },
  { id: "Q-105", mrn: "M2026-1105", name: "강민재", age: 73, sex: "M", ktas: 1, chief: "의식 저하",                registeredAt: mqTime(18), arrivedAt: mqTime(20), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 95,  dbp: 55, hr: 120, rr: 24, spo2: 88, bt: 35.6 } },
  { id: "Q-106", mrn: "M2026-1106", name: "임채원", age: 35, sex: "F", ktas: 3, chief: "두통·시야 흐림",            registeredAt: mqTime(22), arrivedAt: mqTime(24), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 145, dbp: 92, hr: 82,  rr: 16, spo2: 98, bt: 36.6 } },
  { id: "Q-107", mrn: "M2026-1107", name: "조현우", age: 52, sex: "M", ktas: 3, chief: "허리 통증·하지 저림",        registeredAt: mqTime(27), arrivedAt: mqTime(29), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 128, dbp: 80, hr: 76,  rr: 15, spo2: 98, bt: 36.8 } },
  { id: "Q-108", mrn: "M2026-1108", name: "신유나", age: 24, sex: "F", ktas: 4, chief: "발목 부종·외상",            registeredAt: mqTime(31), arrivedAt: mqTime(33), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 116, dbp: 72, hr: 84,  rr: 14, spo2: 99, bt: 36.5 } },
  { id: "Q-109", mrn: "M2026-1109", name: "배성훈", age: 60, sex: "M", ktas: 2, chief: "흉부 압박감 간헐적",         registeredAt: mqTime(36), arrivedAt: mqTime(38), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 150, dbp: 95, hr: 88,  rr: 18, spo2: 95, bt: 36.7 } },
  { id: "Q-110", mrn: "M2026-1110", name: "문가영", age: 47, sex: "F", ktas: 3, chief: "심계항진·불안감",           registeredAt: mqTime(40), arrivedAt: mqTime(42), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 124, dbp: 78, hr: 112, rr: 18, spo2: 98, bt: 36.9 } },
  { id: "Q-111", mrn: "M2026-1111", name: "권태경", age: 38, sex: "M", ktas: 4, chief: "찰과상·경미 출혈",          registeredAt: mqTime(45), arrivedAt: mqTime(47), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 120, dbp: 76, hr: 72,  rr: 14, spo2: 99, bt: 36.6 } },
  { id: "Q-112", mrn: "M2026-1112", name: "남지호", age: 81, sex: "F", ktas: 2, chief: "낙상 후 고관절 통증",        registeredAt: mqTime(52), arrivedAt: mqTime(54), ecg: "pending", cxr: "pending", lab: "pending", aiStatus: "pending", vitals: { sbp: 142, dbp: 86, hr: 94,  rr: 18, spo2: 96, bt: 36.4 } },
];

export default function TriagePageV2() {
  const nav = useNavigate();

  /* ── 환자 식별 ── */
  const [subjectId, setSubjectId] = useState("");
  const [name, setName] = useState("");
  const [age, setAge]   = useState<number | "">("");
  const [sex, setSex]   = useState<Sex>("M");

  /* ── 활력징후 ── */
  const [hr, setHr]     = useState<number | "">("");
  const [sbp, setSbp]   = useState<number | "">("");
  const [dbp, setDbp]   = useState<number | "">("");
  const [rr, setRr]     = useState<number | "">("");
  const [spo2, setSpo2] = useState<number | "">("");
  const [bt, setBt]     = useState<number | "">("");
  const [pain, setPain] = useState<number | "">("");

  /* ── 임상 ── */
  const [chief, setChief] = useState("");
  // 영문 주호소 코드 (데모 케이스 선택 시) — 백엔드 CC Map 라우팅용
  const [chiefCode, setChiefCode] = useState<ChiefComplaint | undefined>(undefined);
  const [ktas, setKtas] = useState<KTAS>(3);
  const [admission, setAdmission] = useState(() => new Date().toISOString().slice(0, 16));
  const [allergies, setAllergies] = useState("");
  const [meds, setMeds] = useState("");
  const [notes, setNotes] = useState("");
  const [pastHx, setPastHx] = useState<Record<PastHistoryCode, boolean>>({
    HTN: false, DM: false, CAD: false, CVA: false, COPD: false,
    ASTHMA: false, CKD: false, AFIB: false,
    LIVER: false, CANCER: false, ALLERGY: false, PREGNANT: false,
  });

  const [toast, setToast] = useState<string | null>(null);

  /* ── 음성 입력 (Web Speech API, ko-KR) ── */
  const { supported: micSupported, listening, transcript, interim, start, stop, reset: resetVoice } = useSpeechRecognition("ko-KR");
  const appliedRef = useRef(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMimic, setSelectedMimic] = useState<DemoPatient["mimic"]>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<DemoPatient["recommendation"]>(undefined);
  const [selectedAiVerdict, setSelectedAiVerdict] = useState<DemoPatient["aiVerdict"]>(undefined);

  const caseList = useMemo(() => DEMO_PATIENTS.filter((p) => p.mimic?.subject_id), []);
  // 접수 대기열 = 핵심 테스트 케이스(백엔드 실판독) + mock 환자들로 아래까지 채움
  const queue = useMemo(() => [...caseList, ...MOCK_QUEUE], [caseList]);
  // "최근 등록"·"환자 목록" = 실제 트리아지로 등록된 라이브 환자만 (테스트/데모 케이스 제외).
  // 테스트 케이스는 좌측 "접수 대기열"에만 노출. DB·세션 비우면 비고, 트리아지하면 뜸.
  const livePatients = getLivePatients();
  const allPatients = livePatients;
  const recent = livePatients.slice(0, 5);

  // 백엔드 실시간 상태(report_status) 폴링 → 워크리스트 배지 자동 갱신 (검사대기→검사완료→소견완료)
  const [statusMap, setStatusMap] = useState<Map<string, ReportStatus | null>>(new Map());
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const list = await listEncounters("active", 50);
      if (alive && list) setStatusMap(new Map(list.map((e) => [e.encounter_id, e.report_status])));
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const EMPTY_HX: Record<PastHistoryCode, boolean> = {
    HTN: false, DM: false, CAD: false, CVA: false, COPD: false,
    ASTHMA: false, CKD: false, AFIB: false,
    LIVER: false, CANCER: false, ALLERGY: false, PREGNANT: false,
  };

  function reset() {
    setSubjectId(""); setName(""); setAge(""); setSex("M");
    setHr(""); setSbp(""); setDbp(""); setRr(""); setSpo2(""); setBt(""); setPain("");
    setChief(""); setChiefCode(undefined); setKtas(3); setAllergies(""); setMeds(""); setNotes("");
    setAdmission(new Date().toISOString().slice(0, 16));
    setPastHx({ ...EMPTY_HX });
    setSelectedId(null); setSelectedMimic(null);
    setSelectedRecommendation(undefined); setSelectedAiVerdict(undefined);
  }

  // 대기열 클릭 → 폼 자동 채움
  function selectPatient(p: DemoPatient) {
    setSelectedId(p.id);
    setSelectedMimic(p.mimic ?? null);
    setSelectedRecommendation(p.recommendation);
    setSelectedAiVerdict(p.aiVerdict);
    setSubjectId(p.mimic?.subject_id ?? p.mrn ?? p.id);
    setName(p.name);
    setAge(p.age);
    setSex(p.sex);
    setHr(p.vitals.hr ?? ""); setSbp(p.vitals.sbp ?? ""); setDbp(p.vitals.dbp ?? "");
    setRr(p.vitals.rr ?? ""); setSpo2(p.vitals.spo2 ?? ""); setBt(p.vitals.bt ?? "");
    setChief(p.chief); setChiefCode(p.chiefCode); setKtas(p.ktas);
    setAllergies(p.allergies ?? ""); setMeds(p.medications ?? ""); setNotes(p.notes ?? "");
    const hx = { ...EMPTY_HX };
    (p.pastHistory ?? []).forEach((code) => { hx[code] = true; });
    setPastHx(hx);
    setToast(`✓ ${p.name} 선택됨 — 폼이 채워졌습니다.`);
    setTimeout(() => setToast(null), 2500);
  }

  function applyParsed(text: string) {
    const p = parseTriageSpeech(text);
    const filled: string[] = [];
    if (p.subjectId) { setSubjectId(p.subjectId); filled.push("등록번호"); }
    if (p.name)      { setName(p.name); filled.push("환자명"); }
    if (p.age !== undefined)  { setAge(p.age); filled.push("나이"); }
    if (p.sex)       { setSex(p.sex); filled.push("성별"); }
    if (p.hr !== undefined)   { setHr(p.hr); filled.push("HR"); }
    if (p.sbp !== undefined)  { setSbp(p.sbp); filled.push("SBP"); }
    if (p.dbp !== undefined)  { setDbp(p.dbp); filled.push("DBP"); }
    if (p.rr !== undefined)   { setRr(p.rr); filled.push("RR"); }
    if (p.spo2 !== undefined) { setSpo2(p.spo2); filled.push("SpO₂"); }
    if (p.bt !== undefined)   { setBt(p.bt); filled.push("체온"); }
    if (p.pain !== undefined) { setPain(p.pain); filled.push("통증"); }
    if (p.chief)     { setChief(p.chief); filled.push("주호소"); }
    if (p.ktas)      { setKtas(p.ktas); filled.push(`KTAS ${p.ktas}`); }
    if (p.pastHx?.length) {
      setPastHx((prev) => {
        const next = { ...prev };
        p.pastHx!.forEach((c) => { next[c] = true; });
        return next;
      });
      filled.push("과거력");
    }
    setToast(filled.length ? `🎤 음성 입력 적용 — ${filled.join(", ")}` : "인식된 항목이 없습니다. 더 또박또박 말씀해 주세요.");
    setTimeout(() => setToast(null), 4000);
  }

  function startVoice() {
    if (!micSupported) { alert("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge에서 사용해 주세요."); return; }
    appliedRef.current = false;
    start();
  }

  useEffect(() => {
    if (!listening && transcript.trim() && !appliedRef.current) {
      appliedRef.current = true;
      applyParsed(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, transcript]);

  const [submitting, setSubmitting] = useState(false);
  const canSubmit = !!(subjectId.trim() && name.trim() && age !== "" && chief.trim());

  async function submit() {
    if (!subjectId || !age || !chief) { alert("환자 ID, 나이, 주증상은 필수입니다."); return; }
    setSubmitting(true);
    const vitalsInput = {
      hr: Number(hr) || 0, sbp: Number(sbp) || 0, dbp: Number(dbp) || 0,
      spo2: Number(spo2) || 0, rr: Number(rr) || 0, bt: Number(bt) || 36.5,
    };
    const pastHistory = PAST_HX_CODES.filter((c) => pastHx[c]);
    const result = await submitTriage({
      name: name || subjectId, age: Number(age), sex, vitals: vitalsInput, chief, chiefCode,
      pastHistory, allergies, medications: meds, notes, mimic: selectedMimic,
    });
    setSubmitting(false);

    if (result?.encounter_id) {
      const live: DemoPatient = {
        id: result.encounter_id, mrn: subjectId, fhirPatientId: result.patient_id,
        name: name || subjectId, age: Number(age), sex, ktas, chief,
        registeredAt: new Date().toISOString(),
        arrivedAt: admission ? new Date(admission).toISOString() : new Date().toISOString(),
        ecg: selectedRecommendation ? "done" : "pending",
        cxr: selectedRecommendation ? "done" : "pending",
        lab: selectedRecommendation ? "done" : "pending",
        aiStatus: selectedRecommendation ? "done" : "analyzing",
        vitals: {
          hr: vitalsInput.hr || null, sbp: vitalsInput.sbp || null, dbp: vitalsInput.dbp || null,
          rr: vitalsInput.rr || null, spo2: vitalsInput.spo2 || null, bt: vitalsInput.bt || null,
        },
        pastHistory, allergies: allergies || undefined, medications: meds || undefined,
        notes: notes || undefined, mimic: selectedMimic,
        recommendation: selectedRecommendation, aiVerdict: selectedAiVerdict,
      };
      registerLivePatient(live);
      setCurrentPatientId(result.encounter_id);
      nav(`/demo/patient/${result.encounter_id}?encounter_id=${result.encounter_id}`);
      return;
    }
    setToast(`✓ 트리아지 등록 완료 (Subject ${subjectId}) · 백엔드 미연동 — 데모 모드`);
    reset();
    setTimeout(() => setToast(null), 3500);
  }

  // 입력 스타일 (라이트 + 다크) — 직관적 크기
  const fieldCls = "w-full h-11 px-3.5 rounded-lg text-[15px] bg-slate-50 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-vuno-dim focus:outline-none focus:border-brand-500 focus:bg-white dark:focus:bg-vuno-bg focus:ring-2 focus:ring-brand-500/15 transition-colors";
  const labelCls = "text-[12px] font-semibold uppercase tracking-wide text-slate-500 dark:text-vuno-muted";
  const cardCls = "bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl p-5";
  // 좌·우 사이드바 — 전체 높이로 채우고 화면 고정(헤더 상단 고정 · 본문 내부 스크롤)
  const stickyCls = "flex flex-col lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:overflow-hidden";

  const vitals: Array<[string, number | "", (v: number | "") => void]> = [
    ["HR (BPM)", hr, setHr], ["SBP", sbp, setSbp], ["DBP", dbp, setDbp], ["RR", rr, setRr],
    ["SpO₂ (%)", spo2, setSpo2], ["BT (°C)", bt, setBt], ["PAIN (0-10)", pain, setPain],
  ];
  const sbpHigh = sbp !== "" && sbp > 140;
  const spo2Low = spo2 !== "" && spo2 < 95;
  const painHigh = pain !== "" && pain >= 7;

  return (
    <AppShell>
      <div className="bg-slate-100 dark:bg-vuno-bg text-slate-900 dark:text-white min-h-[calc(100vh-3.5rem)]">
        <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_300px] lg:items-start">

          {/* ── 좌: 접수 대기열 (고정) ── */}
          <aside className={cn("border-r border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface", stickyCls)}>
            {/* 헤더 — 상단 고정(flush) */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-vuno-border flex-shrink-0">
              <h4 className="text-[16px] font-bold">접수 대기열</h4>
              <span className="px-2.5 py-1 rounded text-[12px] font-bold bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{queue.length}</span>
            </div>
            {/* 본문 — 아래로 채움(내부 스크롤) */}
            <div className="flex-1 min-h-0 lg:overflow-y-auto p-4">
            <div className="space-y-2">
              {queue.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPatient(p)}
                  className={cn(
                    "w-full text-left rounded-lg border p-2.5 transition-colors",
                    selectedId === p.id
                      ? "border-brand-300 border-l-[3px] border-l-brand-600 bg-brand-50 dark:bg-brand-500/15 dark:border-brand-500/50"
                      : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 dark:border-vuno-border dark:bg-vuno-bg dark:hover:bg-vuno-elevated",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[14px] font-bold">{p.name} · {p.sex === "M" ? "M" : "F"}{p.age}</span>
                    <span className="text-[12px] font-numeric text-slate-400 dark:text-vuno-dim">{hhmm(p.registeredAt)}</span>
                  </div>
                  <div className="text-[15px] font-medium text-slate-700 dark:text-vuno-muted mt-1 leading-snug">{p.chief}</div>
                  <div className="text-[12px] font-numeric font-bold text-brand-600 mt-1">#{regNo(p)}</div>
                </button>
              ))}
            </div>
            </div>
          </aside>

          {/* ── 중앙: 입력 폼 (스크롤) ── */}
          <section className="px-6 py-6 space-y-4 min-w-0">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[12px] uppercase tracking-wider text-slate-400 dark:text-vuno-dim font-semibold">TRIAGE · KTAS</span>
                <h2 className="text-[26px] font-bold mt-1">환자 정보입력</h2>
              </div>
              <div className="flex gap-2">
                <button onClick={reset} className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg border border-slate-300 dark:border-vuno-border text-slate-600 dark:text-vuno-muted hover:bg-white dark:hover:bg-vuno-elevated text-[14px] font-semibold transition-colors">
                  <RotateCcw className="h-4 w-4" /> 초기화
                </button>
                <button
                  onClick={listening ? stop : startVoice}
                  disabled={!micSupported}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[14px] font-semibold transition-colors text-white shadow-sm",
                    listening ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-gradient-to-br from-brand-500 to-ai-accent hover:opacity-90",
                    !micSupported && "opacity-50 cursor-not-allowed",
                  )}
                >
                  {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  {listening ? "음성 중지" : "음성 입력"}
                </button>
              </div>
            </div>

            {/* 음성 인식 패널 */}
            {(listening || transcript || interim) && (
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-brand-200 dark:border-brand-500/40 bg-brand-50 dark:bg-brand-500/10">
                <Mic className="h-5 w-5 text-ai-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[12px] text-slate-500 dark:text-vuno-muted">{listening ? "음성 인식 중 · ko-KR" : "음성 인식 결과"}</div>
                  <div className="text-[14px] truncate">{transcript}<span className="text-slate-400 dark:text-vuno-dim">{interim}</span>{!transcript && !interim && <span className="text-slate-400 dark:text-vuno-dim">예: “58세 남자, 흉통 2시간 전 발생, SpO₂ 93%…”</span>}</div>
                </div>
                {!listening && transcript && (
                  <button onClick={() => applyParsed(transcript)} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-brand-600 text-white hover:bg-brand-700 text-[12px] font-bold"><Wand2 className="h-3.5 w-3.5" /> 자동 채움</button>
                )}
                <button onClick={() => { resetVoice(); appliedRef.current = false; }} className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-brand-300 dark:border-brand-500/40 text-brand-700 dark:text-brand-200 hover:bg-brand-100/60 text-[12px] font-bold"><Trash2 className="h-3.5 w-3.5" /> {listening ? "종료" : "지우기"}</button>
              </div>
            )}

            {/* 환자 정보 */}
            <div className={cardCls}>
              <h3 className="text-[16px] font-bold flex items-center gap-2 mb-4"><User className="h-5 w-5 text-brand-600 dark:text-brand-300" /> 환자 정보</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <label className="flex flex-col gap-1.5"><span className={labelCls}>등록번호 (MRN)</span><input className={fieldCls} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} placeholder="240001" /></label>
                <label className="flex flex-col gap-1.5"><span className={labelCls}>이름</span><input className={fieldCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="김OO" /></label>
                <label className="flex flex-col gap-1.5"><span className={labelCls}>나이</span><input type="number" className={cn(fieldCls, "font-numeric")} value={age} onChange={(e) => setAge(e.target.value === "" ? "" : Number(e.target.value))} placeholder="58" /></label>
                <label className="flex flex-col gap-1.5"><span className={labelCls}>성별</span>
                  <div className="flex gap-1.5">
                    {(["M", "F"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => setSex(s)} className={cn("flex-1 h-11 rounded-lg border text-[15px] font-bold transition-colors", sex === s ? "bg-brand-600 border-transparent text-white" : "bg-slate-50 border-slate-200 text-slate-600 dark:bg-vuno-bg dark:border-vuno-border dark:text-vuno-muted")}>{s === "M" ? "남" : "여"}</button>
                    ))}
                  </div>
                </label>
                <label className="flex flex-col gap-1.5 col-span-2"><span className={labelCls}>내원 일시</span>
                  <input type="datetime-local" value={admission} onChange={(e) => setAdmission(e.target.value)} className={cn(fieldCls, "font-numeric dark:[color-scheme:dark]")} />
                </label>
                <label className="flex flex-col gap-1.5"><span className={labelCls}>도착 수단</span>
                  <select className={fieldCls}><option>119 구급차</option><option>워크인</option><option>보호자</option><option>전원</option></select>
                </label>
                <label className="flex flex-col gap-1.5"><span className={labelCls}>보험</span>
                  <select className={fieldCls}><option>건강보험</option><option>의료급여</option><option>자비</option></select>
                </label>
                <label className="flex flex-col gap-1.5 col-span-2"><span className={labelCls}>연락처</span><input className={fieldCls} placeholder="010-XXXX-XXXX" /></label>
              </div>
            </div>

            {/* 활력징후 */}
            <div className={cardCls}>
              <h3 className="text-[16px] font-bold flex items-center gap-2 mb-4"><HeartPulse className="h-5 w-5 text-critical" /> 활력징후 <span className="text-[13px] font-normal text-slate-400 dark:text-vuno-dim">비정상값 자동 강조</span></h3>
              <div className="grid grid-cols-4 lg:grid-cols-7 gap-3">
                {vitals.map(([lbl, val, set]) => {
                  const warn = (lbl === "SBP" && sbpHigh) || (lbl === "SpO₂ (%)" && spo2Low);
                  const crit = lbl === "PAIN (0-10)" && painHigh;
                  return (
                    <label key={lbl} className="flex flex-col gap-1.5">
                      <span className={labelCls}>{lbl}</span>
                      <input
                        type="number"
                        value={val}
                        onChange={(e) => set(e.target.value === "" ? "" : Number(e.target.value))}
                        className={cn(
                          "w-full h-11 px-2 rounded-lg text-center text-[17px] font-numeric font-bold border focus:outline-none focus:ring-2 transition-colors",
                          crit ? "border-red-300 bg-red-50 text-red-600 dark:border-red-500/50 dark:bg-red-500/15 dark:text-red-300 focus:ring-red-500/20"
                          : warn ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/50 dark:bg-amber-500/15 dark:text-amber-300 focus:ring-amber-500/20"
                          : "border-slate-200 bg-slate-50 text-slate-900 dark:border-vuno-border dark:bg-vuno-bg dark:text-white focus:border-brand-500 focus:ring-brand-500/15",
                        )}
                      />
                    </label>
                  );
                })}
              </div>
              {(sbpHigh || spo2Low || painHigh) && (
                <div className="flex gap-2 flex-wrap mt-3">
                  {sbpHigh && <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40">SBP &gt; 140</span>}
                  {spo2Low && <span className="px-2 py-1 rounded text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/40">SpO₂ &lt; 95</span>}
                  {painHigh && <span className="px-2 py-1 rounded text-[11px] font-bold bg-red-50 text-red-600 border border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/40">Pain ≥ 7</span>}
                </div>
              )}
            </div>

            {/* 주증상 */}
            <div className={cardCls}>
              <h3 className="text-[16px] font-bold flex items-center gap-2 mb-4"><MessageCircle className="h-5 w-5 text-brand-600 dark:text-brand-300" /> 주증상 (Chief Complaint) <span className="text-brand-600">*</span></h3>
              <textarea value={chief} onChange={(e) => { setChief(e.target.value); setChiefCode(undefined); }} rows={3} placeholder="예: 흉통 2시간 전 발생, 좌측 팔로 방사, 발한 동반" className={cn(fieldCls, "h-auto py-2.5 resize-y")} />
              <div className="flex gap-2 flex-wrap mt-3">
                {["흉통", "호흡곤란", "복통", "두통", "의식 저하", "외상", "발열"].map((c) => (
                  <button key={c} type="button" onClick={() => setChief((v) => v ? `${v}, ${c}` : c)} className="px-3 py-1.5 rounded-full text-[13px] bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-vuno-bg dark:text-vuno-muted dark:hover:bg-vuno-elevated transition-colors">{c}</button>
                ))}
              </div>
            </div>

            {/* KTAS */}
            <div className={cardCls}>
              <h3 className="text-[16px] font-bold flex items-center gap-2 mb-4"><Flame className="h-5 w-5 text-urgent" /> KTAS 등급</h3>
              <div className="grid grid-cols-5 gap-2">
                {KTAS_OPTS.map(({ k, en, t }) => {
                  const on = ktas === k;
                  const meta = KTAS_META[k];
                  return (
                    <button key={k} type="button" onClick={() => setKtas(k)} className={cn(
                      "py-3 px-2 rounded-lg border text-center transition-all",
                      on ? cn(meta.bg, "border-transparent text-white shadow-sm -translate-y-0.5") : "bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 dark:bg-vuno-bg dark:border-vuno-border dark:text-slate-200",
                    )}>
                      <div className="text-[22px] font-bold">{k}</div>
                      <div className={cn("text-[11px] mt-0.5", on ? "text-white/90" : "text-slate-400 dark:text-vuno-dim")}>{en} · {t}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 과거력 */}
            <div className={cardCls}>
              <h3 className="text-[16px] font-bold flex items-center gap-2 mb-4"><History className="h-5 w-5 text-slate-500 dark:text-vuno-muted" /> 과거력 · 알레르기 · 복용약</h3>
              <span className={labelCls}>과거력 (다중 선택)</span>
              <div className="flex gap-1.5 flex-wrap mt-2 mb-4">
                {PAST_HX_CODES.map((code) => {
                  const on = pastHx[code];
                  return (
                    <button key={code} type="button" onClick={() => setPastHx((prev) => ({ ...prev, [code]: !prev[code] }))} title={PAST_HISTORY_LABELS[code]} className={cn("px-3 py-1.5 rounded-full text-[13px] font-bold border transition-colors", on ? "bg-brand-600 border-transparent text-white" : "bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200 dark:bg-vuno-bg dark:border-vuno-border dark:text-vuno-muted")}>{code}</button>
                  );
                })}
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <label className="flex flex-col gap-1.5"><span className={labelCls}>알레르기</span><input className={fieldCls} value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="예: NSAID (rash)" /></label>
                <label className="flex flex-col gap-1.5"><span className={labelCls}>복용약</span><input className={fieldCls} value={meds} onChange={(e) => setMeds(e.target.value)} placeholder="예: Aspirin · Metformin" /></label>
                <label className="flex flex-col gap-1.5 lg:col-span-2"><span className={labelCls}>트리아지 노트</span><textarea className={cn(fieldCls, "h-auto py-2.5 resize-y")} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="특이사항 · 인계 메모" /></label>
              </div>
            </div>

            {/* 액션 */}
            <div className="flex items-center gap-3 pb-6">
              <span className={cn("text-[13px] mr-auto", canSubmit ? "text-slate-400 dark:text-vuno-dim" : "text-amber-600 dark:text-amber-400 font-medium")}>
                {canSubmit ? "제출 시 ECG · CXR · LAB AI 분석이 자동 시작됩니다." : "필수: 등록번호 · 이름 · 나이 · 주호소"}
              </span>
              <button onClick={reset} className="h-12 px-5 rounded-lg border border-slate-300 dark:border-vuno-border text-slate-600 dark:text-vuno-muted hover:bg-white dark:hover:bg-vuno-elevated text-[15px] font-semibold transition-colors">취소</button>
              <button onClick={submit} disabled={submitting || !canSubmit} className="inline-flex items-center gap-2 h-12 px-7 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-bold text-[16px] shadow-sm disabled:bg-slate-300 disabled:text-white/70 dark:disabled:bg-vuno-elevated disabled:cursor-not-allowed transition-colors"><Rocket className="h-5 w-5" /> {submitting ? "전송 중…" : "등록 · AI 분석 시작"}</button>
            </div>
          </section>

          {/* ── 우: 환자 목록 (고정) ── */}
          <aside className={cn("border-l border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface", stickyCls)}>
            {/* 헤더 — 상단 고정(flush) */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-vuno-border flex-shrink-0">
              <h4 className="text-[16px] font-bold">환자 목록</h4>
              <span className="text-[13px] font-numeric text-slate-400 dark:text-vuno-dim">Total {allPatients.length}</span>
            </div>
            {/* 본문 — 아래로 채움(내부 스크롤) */}
            <div className="flex-1 min-h-0 lg:overflow-y-auto p-4">
            <div className="space-y-2">
              {allPatients.map((p) => {
                const meta = KTAS_META[p.ktas];
                const st = statusOf(p, statusMap.get(p.id));
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => nav(patientHref(p))}
                    className="w-full text-left rounded-lg border border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 dark:border-vuno-border dark:bg-vuno-bg dark:hover:bg-vuno-elevated p-2.5 transition-colors"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={cn("px-1.5 py-0.5 rounded text-[11px] font-bold text-white", meta.bg)}>{p.ktas}</span>
                      <span className="text-[14px] font-bold">{p.name}</span>
                      <span className="text-[12px] text-slate-400 dark:text-vuno-dim">{p.sex === "M" ? "남" : "여"}/{p.age}</span>
                      <ChevronRight className="h-4 w-4 text-slate-300 dark:text-vuno-dim ml-auto" />
                    </div>
                    <div className="text-[12px] text-slate-500 dark:text-vuno-muted mt-1 truncate">{p.chief}</div>
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[13px] font-numeric font-bold text-brand-600">#{regNo(p)}</span>
                      <span className={cn("px-2 py-0.5 rounded text-[11px] font-bold border", st.cls)}>{st.label}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            </div>
          </aside>
        </div>
      </div>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md bg-slate-800 text-white text-base font-bold shadow-lg">{toast}</div>
      )}
    </AppShell>
  );
}
