import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Rocket, RotateCcw, Search, FilePlus2, Save, Mic, MicOff, Trash2, Wand2,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { cn } from "../../lib/cn";
import { KTAS_META, type KTAS, type Sex, PAST_HISTORY_LABELS, type PastHistoryCode } from "../../types/triage";
import { DEMO_PATIENTS, registerLivePatient, type DemoPatient } from "../../lib/v2/demoStore";
import { submitTriage } from "../../lib/v2/api";
import { useSpeechRecognition } from "../../lib/v2/speech";
import { parseTriageSpeech } from "../../lib/v2/triageVoiceParse";

/* ─────────────────────────────────────────────────────────
   say-6 EMR Triage Workstation
   VUNO DeepCARS 톤 (다크 슬레이트 헤더 + 흰 본문 + 의료 표준 표)
   ───────────────────────────────────────────────────────── */

const PAST_HX_CODES: PastHistoryCode[] = ["HTN", "DM", "CAD", "CVA", "COPD", "ASTHMA", "CKD", "AFIB"];

export default function TriagePageV2() {
  const nav = useNavigate();

  /* ── 환자 식별 ── */
  // subjectId = 화면상 "등록번호 (MRN)" = FHIR Patient.identifier[type=MR]
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

  const [search, setSearch] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  /* ── 음성 입력 (Web Speech API, ko-KR) ── */
  const { supported: micSupported, listening, transcript, interim, start, stop, reset: resetVoice } = useSpeechRecognition("ko-KR");
  const appliedRef = useRef(false);
  // 큐에서 선택한 환자 (데모 케이스면 MIMIC 식별자 + AI 권고 데이터 — submit 시 라이브 환자에 그대로 보존)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedMimic, setSelectedMimic] = useState<DemoPatient["mimic"]>(null);
  const [selectedRecommendation, setSelectedRecommendation] = useState<DemoPatient["recommendation"]>(undefined);
  const [selectedAiVerdict, setSelectedAiVerdict] = useState<DemoPatient["aiVerdict"]>(undefined);

  const queueList = useMemo(() => {
    if (!search.trim()) return DEMO_PATIENTS;
    const q = search.toLowerCase();
    return DEMO_PATIENTS.filter(
      (p) => p.name.includes(search) || p.id.includes(q) || p.chief.includes(search),
    );
  }, [search]);

  // 테스트 케이스 — MIMIC subject_id가 있는 핵심 4케이스 (원정아·홍경태·이정인·양정인)
  const caseList = useMemo(() => DEMO_PATIENTS.filter((p) => p.mimic?.subject_id), []);

  const EMPTY_HX: Record<PastHistoryCode, boolean> = {
    HTN: false, DM: false, CAD: false, CVA: false, COPD: false,
    ASTHMA: false, CKD: false, AFIB: false,
    LIVER: false, CANCER: false, ALLERGY: false, PREGNANT: false,
  };

  function reset() {
    setSubjectId(""); setName(""); setAge(""); setSex("M");
    setHr(""); setSbp(""); setDbp(""); setRr(""); setSpo2(""); setBt(""); setPain("");
    setChief(""); setKtas(3); setAllergies(""); setMeds(""); setNotes("");
    setPastHx({ ...EMPTY_HX });
    setSelectedId(null);
    setSelectedMimic(null);
    setSelectedRecommendation(undefined);
    setSelectedAiVerdict(undefined);
  }

  // 큐에서 환자 클릭 → 트리아지 폼 자동 채움 (레거시 EMR과 동일한 동작)
  function selectPatient(p: DemoPatient) {
    setSelectedId(p.id);
    setSelectedMimic(p.mimic ?? null);
    setSelectedRecommendation(p.recommendation);
    setSelectedAiVerdict(p.aiVerdict);
    setSubjectId(p.mimic?.subject_id ?? p.id);
    setName(p.name);
    setAge(p.age);
    setSex(p.sex);
    setHr(p.vitals.hr ?? "");
    setSbp(p.vitals.sbp ?? "");
    setDbp(p.vitals.dbp ?? "");
    setRr(p.vitals.rr ?? "");
    setSpo2(p.vitals.spo2 ?? "");
    setBt(p.vitals.bt ?? "");
    setPain("");
    setChief(p.chief);
    setKtas(p.ktas);
    setAllergies(p.allergies ?? "");
    setMeds(p.medications ?? "");
    setNotes(p.notes ?? "");
    const hx = { ...EMPTY_HX };
    (p.pastHistory ?? []).forEach((code) => { hx[code] = true; });
    setPastHx(hx);
    setToast(`✓ ${p.name} 선택됨 — 폼이 채워졌습니다. 검토 후 Submit + AI`);
    setTimeout(() => setToast(null), 2500);
  }

  // 음성 받아쓰기 → 폼 필드 자동 채움
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
    setToast(filled.length
      ? `🎤 음성 입력 적용 — ${filled.join(", ")}`
      : "인식된 항목이 없습니다. 더 또박또박 말씀해 주세요.");
    setTimeout(() => setToast(null), 4000);
  }

  function startVoice() {
    if (!micSupported) {
      alert("이 브라우저는 음성 인식을 지원하지 않습니다. Chrome 또는 Edge에서 사용해 주세요.");
      return;
    }
    appliedRef.current = false;
    start();
  }

  // 인식 종료 시점에 누적 transcript 자동 적용 (1회)
  useEffect(() => {
    if (!listening && transcript.trim() && !appliedRef.current) {
      appliedRef.current = true;
      applyParsed(transcript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listening, transcript]);

  const [submitting, setSubmitting] = useState(false);
  // 필수 환자정보(등록번호·환자명·나이·주호소) 미입력 시 액션 버튼 비활성
  const canSubmit = !!(subjectId.trim() && name.trim() && age !== "" && chief.trim());

  async function submit() {
    if (!subjectId || !age || !chief) {
      alert("환자 ID, 나이, 주증상은 필수입니다.");
      return;
    }
    setSubmitting(true);
    const vitalsInput = {
      hr: Number(hr) || 0, sbp: Number(sbp) || 0, dbp: Number(dbp) || 0,
      spo2: Number(spo2) || 0, rr: Number(rr) || 0, bt: Number(bt) || 36.5,
    };
    const pastHistory = PAST_HX_CODES.filter((c) => pastHx[c]);

    const result = await submitTriage({
      name: name || subjectId,
      age: Number(age),
      sex,
      vitals: vitalsInput,
      chief,
      pastHistory,
      allergies,
      medications: meds,
      notes,
      mimic: selectedMimic,
    });
    setSubmitting(false);

    if (result?.encounter_id) {
      // 백엔드 encounter 생성 성공 → 라이브 환자 등록 후 환자 상세로 이동
      const live: DemoPatient = {
        id: result.encounter_id,
        mrn: subjectId,
        fhirPatientId: result.patient_id,
        name: name || subjectId,
        age: Number(age),
        sex,
        ktas,
        chief,
        registeredAt: new Date().toISOString(),
        arrivedAt: new Date().toISOString(),
        ecg: selectedRecommendation ? "done" : "pending",
        cxr: selectedRecommendation ? "done" : "pending",
        lab: selectedRecommendation ? "done" : "pending",
        aiStatus: selectedRecommendation ? "done" : "analyzing",
        vitals: {
          hr: vitalsInput.hr || null, sbp: vitalsInput.sbp || null,
          dbp: vitalsInput.dbp || null, rr: vitalsInput.rr || null,
          spo2: vitalsInput.spo2 || null, bt: vitalsInput.bt || null,
        },
        // 큐에서 선택한 환자의 식별자/임상정보 보존 — 환자 상세 사이드바 표시용
        pastHistory,
        allergies: allergies || undefined,
        medications: meds || undefined,
        notes: notes || undefined,
        mimic: selectedMimic,
        // 큐에서 선택한 데모 케이스의 AI 권고·판정 보존 → 라이브 환자에도 그대로 표시
        recommendation: selectedRecommendation,
        aiVerdict: selectedAiVerdict,
      };
      registerLivePatient(live);
      nav(`/demo/patient/${result.encounter_id}?encounter_id=${result.encounter_id}`);
      return;
    }

    // 백엔드 미연동 → 데모 모드 토스트
    setToast(`✓ 트리아지 등록 완료 (Subject ${subjectId}) · 백엔드 미연동 — 데모 모드`);
    reset();
    setTimeout(() => setToast(null), 3500);
  }

  return (
    <AppShell>
      <div className="min-h-[calc(100vh-56px)] bg-slate-100 text-slate-900 dark:bg-vuno-bg dark:text-white">

        {/* 액션 툴바 */}
        <div className="sticky top-14 z-10 bg-white border-b border-slate-300 dark:bg-vuno-surface dark:border-vuno-border px-6 h-14 flex items-center gap-3">
          <span className="inline-flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-base">
            <span className="h-8 w-8 grid place-items-center bg-gradient-to-br from-brand-500 to-ai-accent text-white rounded-lg shadow-sm">
              <FilePlus2 className="h-4 w-4" />
            </span>
            신규 환자 등록
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-vuno-muted">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span>박서연 간호사 · 접속 중</span>
          </span>
          <button
            onClick={listening ? stop : startVoice}
            disabled={!micSupported}
            title={micSupported ? "음성으로 환자정보 입력" : "이 브라우저는 음성 인식을 지원하지 않습니다 (Chrome·Edge 권장)"}
            className={cn(
              "inline-flex items-center gap-1.5 h-9 px-4 rounded-lg font-bold text-[13px] transition-colors shadow-sm",
              listening
                ? "bg-red-600 text-white hover:bg-red-700 animate-pulse"
                : "bg-gradient-to-br from-brand-500 to-ai-accent text-white hover:opacity-90",
              !micSupported && "opacity-50 cursor-not-allowed",
            )}
          >
            {listening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            {listening ? "음성 중지" : "음성 입력"}
          </button>
          <button
            onClick={reset}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-vuno-border dark:text-vuno-muted dark:hover:bg-vuno-elevated font-bold text-[13px] transition-colors"
          >
            <RotateCcw className="h-3.5 w-3.5" /> 초기화
          </button>
          <button
            disabled={!canSubmit}
            title={canSubmit ? "" : "환자정보를 먼저 입력하세요"}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-vuno-border dark:text-slate-200 dark:hover:bg-vuno-elevated font-bold text-[13px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          >
            <Save className="h-3.5 w-3.5" /> 임시저장
          </button>
        </div>

        {/* ── 중앙 박스형 폼 ── */}
        <main className="max-w-[880px] mx-auto px-6 py-8 space-y-5">

          {/* 테스트 케이스 — 클릭 시 폼 자동 입력 (MIMIC subject_id 기반 4케이스) */}
          <Section title="테스트 케이스" en="Demo Cases · 클릭하면 자동 입력">
            <div className="grid grid-cols-2 gap-2.5">
              {caseList.map((p) => {
                const meta = KTAS_META[p.ktas];
                const active = selectedId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => selectPatient(p)}
                    className={cn(
                      "text-left rounded-lg border p-3 transition-colors",
                      active
                        ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15 dark:border-brand-500/50"
                        : "border-slate-200 bg-slate-50 hover:bg-white hover:border-slate-300 dark:border-vuno-border dark:bg-vuno-bg dark:hover:bg-vuno-elevated",
                    )}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[15px] font-bold text-slate-900 dark:text-white">{p.name}</span>
                      <span className="text-[12px] text-slate-500 dark:text-vuno-muted">{p.age}세 / {p.sex === "M" ? "남" : "여"}</span>
                      <span className={cn("ml-auto px-1.5 py-0.5 rounded text-[10px] font-bold text-white", meta.bg)}>KTAS {p.ktas}</span>
                    </div>
                    <div className="text-[12px] text-slate-600 dark:text-vuno-muted truncate">{p.chief}</div>
                    <div className="text-[10px] text-slate-400 dark:text-vuno-dim font-numeric mt-0.5">#{p.mimic?.subject_id}</div>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* 음성 입력 패널 — 듣는 중이거나 인식 결과가 있을 때 표시 */}
          {(listening || transcript || interim) && (
            <div className="rounded-xl border border-brand-300 bg-brand-50 dark:bg-brand-500/10 dark:border-brand-500/40 p-4">
              <div className="flex items-center gap-2 mb-2">
                {listening ? (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
                  </span>
                ) : (
                  <Mic className="h-4 w-4 text-brand-600 dark:text-brand-300" />
                )}
                <span className="text-sm font-bold text-brand-700 dark:text-brand-300">
                  {listening ? "듣는 중… 또박또박 말씀해 주세요" : "음성 인식 결과"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {!listening && transcript && (
                    <button
                      onClick={() => applyParsed(transcript)}
                      className="inline-flex items-center gap-1 h-8 px-3 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-bold text-[12px] transition-colors"
                    >
                      <Wand2 className="h-3.5 w-3.5" /> 자동 채우기
                    </button>
                  )}
                  <button
                    onClick={() => { resetVoice(); appliedRef.current = false; }}
                    className="inline-flex items-center gap-1 h-8 px-3 rounded-lg border border-brand-300 dark:border-brand-500/40 text-brand-700 dark:text-brand-300 hover:bg-brand-100/60 dark:hover:bg-brand-500/15 font-bold text-[12px] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> 지우기
                  </button>
                </div>
              </div>
              <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-200 min-h-[1.5rem]">
                {transcript}{" "}
                <span className="text-slate-400 dark:text-vuno-dim">{interim}</span>
                {!transcript && !interim && (
                  <span className="text-slate-400 dark:text-vuno-dim">
                    예: “55세 남자, 등록번호 12345678, 혈압 140에 90, 맥박 100, 산소포화도 95, 체온 38.2, 통증 7, KTAS 2, 주호소는 흉통, 고혈압 당뇨 있음”
                  </span>
                )}
              </p>
            </div>
          )}

          {/* 1. 환자 정보 */}
          <Section title="환자 정보" en="Patient Identification">
            <div className="grid grid-cols-2 gap-5">
              <Field label="등록번호 (MRN)" required>
                <Input value={subjectId} onChange={setSubjectId} placeholder="12345678" mono />
              </Field>
              <Field label="환자명" required>
                <Input value={name} onChange={setName} placeholder="김OO" />
              </Field>
              <Field label="나이" required>
                <NumPicker value={age} min={0} max={120} unit="세" onChange={setAge} />
              </Field>
              <Field label="성별">
                <Toggle value={sex} options={["M", "F"] as const} onChange={setSex} />
              </Field>
              <Field label="내원 일시" full>
                <input
                  type="datetime-local"
                  value={admission}
                  onChange={(e) => setAdmission(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 dark:bg-vuno-bg dark:border-vuno-border dark:text-white dark:[color-scheme:dark] text-base focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors"
                />
              </Field>
            </div>
          </Section>

          {/* 2. 주호소 (먼저) */}
          <Section title="주호소" en="Chief Complaint" required>
            <textarea
              value={chief}
              onChange={(e) => setChief(e.target.value)}
              placeholder="예: 흉통, 호흡곤란 30분 전 발생. 좌측 흉부 압박감 동반."
              rows={3}
              className="w-full px-3.5 py-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 dark:bg-vuno-bg dark:border-vuno-border dark:text-white text-base placeholder:text-slate-300 dark:placeholder:text-vuno-dim focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 resize-none transition-colors"
            />
          </Section>

          {/* 3. KTAS (주호소 다음) */}
          <Section title="KTAS Level" en="중증도 분류" required>
            <div className="flex gap-2">
              {([1, 2, 3, 4, 5] as KTAS[]).map((k) => {
                const meta = KTAS_META[k];
                const active = ktas === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKtas(k)}
                    className={cn(
                      "flex-1 py-3 rounded-lg border text-center transition-colors",
                      active ? cn(meta.bg, "border-transparent text-white shadow-sm") : "bg-slate-50 border-slate-200 text-slate-700 hover:bg-white hover:border-slate-300 dark:bg-vuno-bg dark:border-vuno-border dark:text-slate-200 dark:hover:bg-vuno-elevated",
                    )}
                  >
                    <div className="text-base font-bold">Level {k}</div>
                    <div className="text-[13px]">{meta.label}</div>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 text-[13px] text-slate-400 dark:text-vuno-dim">{KTAS_META[ktas].desc}</div>
          </Section>

          {/* 4. 활력징후 — 숫자 스크롤 피커 */}
          <Section title="활력징후" en="Vital Signs">
            <div className="grid grid-cols-3 gap-5">
              <Field label="심박수 (HR)"><NumPicker value={hr} min={20} max={220} unit="bpm" onChange={setHr} /></Field>
              <Field label="수축기 혈압 (SBP)"><NumPicker value={sbp} min={50} max={250} unit="mmHg" onChange={setSbp} /></Field>
              <Field label="이완기 혈압 (DBP)"><NumPicker value={dbp} min={30} max={150} unit="mmHg" onChange={setDbp} /></Field>
              <Field label="호흡수 (RR)"><NumPicker value={rr} min={5} max={60} unit="/min" onChange={setRr} /></Field>
              <Field label="산소포화도 (SpO₂)"><NumPicker value={spo2} min={50} max={100} unit="%" onChange={setSpo2} /></Field>
              <Field label="체온 (BT)"><NumPicker value={bt} min={33} max={43} step={0.1} unit="°C" onChange={setBt} /></Field>
              <Field label="통증 (Pain)"><NumPicker value={pain} min={0} max={10} unit="/10" onChange={setPain} /></Field>
            </div>
          </Section>

          {/* 5. 과거력 */}
          <Section title="과거력" en="Medical History">
            <div className="flex flex-wrap gap-2">
              {PAST_HX_CODES.map((code) => {
                const checked = pastHx[code];
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => setPastHx({ ...pastHx, [code]: !checked })}
                    className={cn(
                      "px-3.5 py-2 rounded-lg border text-base transition-colors",
                      checked
                        ? "border-brand-600 bg-brand-600 text-white font-bold shadow-sm"
                        : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white hover:border-slate-300 dark:border-vuno-border dark:bg-vuno-bg dark:text-slate-200 dark:hover:bg-vuno-elevated",
                    )}
                  >
                    {PAST_HISTORY_LABELS[code]}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-5 mt-4">
              <Field label="알레르기 (Allergies)">
                <Input value={allergies} onChange={setAllergies} placeholder="예: Penicillin, Contrast media" />
              </Field>
              <Field label="복용약 (Medications)">
                <Input value={meds} onChange={setMeds} placeholder="예: Aspirin 100mg QD" />
              </Field>
              <Field label="메모 (Notes)" full>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="트리아지 특이사항 · 인계 메모"
                  rows={2}
                  className="w-full px-3.5 py-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 dark:bg-vuno-bg dark:border-vuno-border dark:text-white text-base placeholder:text-slate-300 dark:placeholder:text-vuno-dim focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 resize-none transition-colors"
                />
              </Field>
            </div>
          </Section>

          {/* 제출 */}
          <div className="flex items-center gap-3 pt-1 pb-4">
            <span className={cn("text-[13px] mr-auto", canSubmit ? "text-slate-400 dark:text-vuno-dim" : "text-amber-600 dark:text-amber-400 font-medium")}>
              {canSubmit
                ? "제출 시 ECG · CXR · LAB AI 분석이 자동 시작됩니다."
                : "필수 항목(등록번호 · 환자명 · 나이 · 주호소)을 입력하세요."}
            </span>
            <button
              onClick={submit}
              disabled={submitting || !canSubmit}
              title={canSubmit ? "" : "환자정보를 먼저 입력하세요"}
              className="inline-flex items-center gap-2 h-12 px-7 rounded-lg bg-brand-600 text-white hover:bg-brand-700 font-bold text-base shadow-sm shadow-brand-600/20 disabled:bg-slate-300 disabled:text-white/70 dark:disabled:bg-vuno-elevated dark:disabled:text-vuno-dim disabled:shadow-none disabled:cursor-not-allowed disabled:hover:bg-slate-300 transition-colors"
            >
              <Rocket className="h-4 w-4" />
              {submitting ? "전송 중…" : "AI 분석 시작"}
            </button>
          </div>
        </main>

        {/* 토스트 */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-3 rounded-md bg-slate-800 text-white text-base font-bold shadow-lg">
            {toast}
          </div>
        )}
      </div>
    </AppShell>
  );
}

/* ─────────────────────────────────────────────────────────
   라이트 박스형 폼 헬퍼 — Section / Field / Input / Toggle / NumPicker
   MOSTI 톤: 흰 카드 + 부드러운 라운드 + 인디고/바이올렛 액센트
   타입 스케일: 섹션라벨 14 / 라벨 13 / 입력 16
   ───────────────────────────────────────────────────────── */
function Section({ title, en, required, children }: {
  title: string; en?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 dark:bg-vuno-surface dark:border-vuno-border">
      <div className="flex items-baseline gap-2 mb-4">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        {required && <span className="text-brand-600 dark:text-brand-400 text-lg font-bold">*</span>}
        {en && <span className="text-lg font-medium text-slate-400 dark:text-vuno-dim">{en}</span>}
      </div>
      {children}
    </section>
  );
}

function Field({ label, required, full, children }: {
  label: string; required?: boolean; full?: boolean; children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2", full && "col-span-2")}>
      <label className="text-[13px] font-medium text-slate-500 dark:text-vuno-muted">
        {label}{required && <span className="text-brand-600 dark:text-brand-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, mono }: {
  value: string | number; onChange: (v: string) => void; placeholder?: string; mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={cn(
        "w-full h-11 px-3.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 dark:bg-vuno-bg dark:border-vuno-border dark:text-white text-base placeholder:text-slate-300 dark:placeholder:text-vuno-dim focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 transition-colors",
        mono && "font-numeric tabular-nums",
      )}
    />
  );
}

function Toggle<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "flex-1 h-11 rounded-lg border text-base font-bold transition-colors",
            value === o ? "bg-brand-600 border-transparent text-white" : "bg-slate-50 border-slate-200 text-slate-600 hover:border-brand-400 dark:bg-vuno-bg dark:border-vuno-border dark:text-vuno-muted dark:hover:border-brand-400",
          )}
        >
          {o === "M" ? "남" : o === "F" ? "여" : o}
        </button>
      ))}
    </div>
  );
}

/* 숫자 피커 — 스크롤(드롭다운)로 선택 + 직접 타이핑 모두 가능 (input + datalist) */
function NumPicker({ value, min, max, step = 1, unit, onChange }: {
  value: number | ""; min: number; max: number; step?: number; unit?: string;
  onChange: (n: number | "") => void;
}) {
  const listId = useId();
  const opts: number[] = [];
  for (let n = min; n <= max + 1e-9; n = +(n + step).toFixed(1)) opts.push(+n.toFixed(1));
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        list={listId}
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))}
        className="w-full h-11 px-3.5 pr-12 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 dark:bg-vuno-bg dark:border-vuno-border dark:text-white dark:[color-scheme:dark] text-base placeholder:text-slate-300 dark:placeholder:text-vuno-dim focus:outline-none focus:bg-white dark:focus:bg-vuno-bg focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 font-numeric tabular-nums transition-colors [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <datalist id={listId}>
        {opts.map((n) => <option key={n} value={n} />)}
      </datalist>
      {unit && <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[13px] text-slate-400 dark:text-vuno-dim">{unit}</span>}
    </div>
  );
}
