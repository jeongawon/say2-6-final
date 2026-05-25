// say-6 v2 — 환자 정보 좌측 사이드바 (환자 상세 / 소견서 / 트리아지 공용)
// 환자 헤더 · 기본정보 · 주증상 · 활력징후 · 과거력/알레르기 · 메모
// edit prop을 주면 동일한 스타일/크기 그대로 "입력 가능"한 폼이 됨 (환자정보입력 페이지용)
// allowEdit prop을 주면 "수정" 버튼이 생겨 의사가 모든 정보를 인라인 편집할 수 있음 (AI 분석/결과 페이지용)

import { useEffect, useState } from "react";
import { KTAS_META, type KTAS, type Sex, PAST_HISTORY_LABELS, type PastHistoryCode } from "../../types/triage";
import type { DemoPatient } from "../../lib/v2/demoStore";
import { useAuth } from "../../lib/v2/auth";
import { cn } from "../../lib/cn";

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** ISO → datetime-local input 값 (YYYY-MM-DDTHH:mm, 로컬시간) */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input 값 → ISO */
function fromLocalInput(v: string): string {
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toISOString();
}

const PAST_HX_CODES: PastHistoryCode[] = ["HTN", "DM", "CAD", "CVA", "COPD", "ASTHMA", "CKD", "AFIB"];
type VitalKey = "hr" | "sbp" | "dbp" | "rr" | "spo2" | "bt";

/** edit prop — 주면 사이드바가 입력 폼이 됨 (스타일/크기는 읽기 전용과 동일) */
export interface SidebarEdit {
  admission: string; // datetime-local 값
  setKtas: (k: KTAS) => void;
  setName: (v: string) => void;
  setAge: (v: number | "") => void;
  setSex: (v: Sex) => void;
  setSubjectId: (v: string) => void;
  setAdmission: (v: string) => void;
  setChief: (v: string) => void;
  setVital: (key: VitalKey, v: number | "") => void;
  togglePastHx: (code: PastHistoryCode) => void;
  setAllergies: (v: string) => void;
  setMeds: (v: string) => void;
  setNotes: (v: string) => void;
}

export function PatientInfoSidebar({
  patient: patientProp, edit: editProp, allowEdit = false, className = "h-full", footer,
}: {
  patient: DemoPatient;
  edit?: SidebarEdit;
  allowEdit?: boolean; // "수정" 버튼으로 의사가 인라인 편집 (AI 분석/결과 페이지)
  className?: string;
  footer?: React.ReactNode; // 하단 고정 액션 영역 (트리아지: 음성입력·초기화·AI 분석 시작)
}) {
  // allowEdit 모드 — 의사가 수정 버튼을 눌러 모든 환자정보를 인라인 편집
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DemoPatient>(patientProp);
  useEffect(() => { setDraft(patientProp); setEditing(false); }, [patientProp.id]);

  const internalEdit: SidebarEdit = {
    admission: toLocalInput(draft.arrivedAt),
    setKtas: (k) => setDraft((d) => ({ ...d, ktas: k })),
    setName: (val) => setDraft((d) => ({ ...d, name: val })),
    setAge: (val) => setDraft((d) => ({ ...d, age: val === "" ? 0 : val })),
    setSex: (val) => setDraft((d) => ({ ...d, sex: val })),
    setSubjectId: (val) => setDraft((d) => ({ ...d, mrn: val })),
    setAdmission: (val) => setDraft((d) => ({ ...d, arrivedAt: fromLocalInput(val) })),
    setChief: (val) => setDraft((d) => ({ ...d, chief: val })),
    setVital: (key, val) => setDraft((d) => ({ ...d, vitals: { ...d.vitals, [key]: val === "" ? null : val } })),
    togglePastHx: (code) => setDraft((d) => {
      const cur = d.pastHistory ?? [];
      return { ...d, pastHistory: cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code] };
    }),
    setAllergies: (val) => setDraft((d) => ({ ...d, allergies: val })),
    setMeds: (val) => setDraft((d) => ({ ...d, medications: val })),
    setNotes: (val) => setDraft((d) => ({ ...d, notes: val })),
  };

  const internalEditing = allowEdit && editing;
  const patient = internalEditing ? draft : patientProp;
  const edit = editProp ?? (internalEditing ? internalEdit : undefined);

  const meta = KTAS_META[patient.ktas as KTAS];
  const v = patient.vitals;

  const vitalRows: [string, number | null, string, boolean, VitalKey][] = [
    ["HR", v.hr, "bpm", !!v.hr && (v.hr < 50 || v.hr > 120), "hr"],
    ["SBP", v.sbp, "mmHg", !!v.sbp && (v.sbp < 90 || v.sbp > 160), "sbp"],
    ["DBP", v.dbp, "mmHg", false, "dbp"],
    ["RR", v.rr, "/min", !!v.rr && (v.rr < 10 || v.rr > 24), "rr"],
    ["SpO₂", v.spo2, "%", !!v.spo2 && v.spo2 < 95, "spo2"],
    ["BT", v.bt, "℃", !!v.bt && (v.bt < 36 || v.bt > 38), "bt"],
  ];

  const inlineInput =
    "bg-transparent focus:outline-none focus:bg-brand-50/60 dark:focus:bg-brand-500/10 rounded transition-colors";

  return (
    <aside className={className}>
      <div className="min-h-full bg-white dark:bg-vuno-surface border border-slate-300 dark:border-vuno-border shadow-sm flex flex-col">
        {/* 환자 헤더 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          {/* 수정 버튼 (allowEdit 모드 전용) */}
          {allowEdit && (
            <div className="flex justify-between items-center gap-2 mb-2.5">
              <span className="flex-1 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border">
                <span className="h-3 w-1 rounded-full bg-brand-500 flex-shrink-0" />
                <span className="text-[14px] font-bold text-slate-700 dark:text-slate-100 tracking-wide">환자 정보</span>
              </span>
              <button
                type="button"
                onClick={() => setEditing((e) => !e)}
                className={cn(
                  "inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-[12px] font-bold transition-colors",
                  editing
                    ? "bg-brand-600 text-white hover:bg-brand-700"
                    : "border border-slate-300 dark:border-vuno-border text-slate-600 dark:text-vuno-muted hover:bg-slate-50 dark:hover:bg-vuno-bg",
                )}
              >
                {editing ? "✓ 완료" : "✎ 수정"}
              </button>
            </div>
          )}

          {edit ? (
            <div className="flex gap-1 mb-2">
              {([1, 2, 3, 4, 5] as KTAS[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => edit.setKtas(k)}
                  className={cn(
                    "flex-1 h-6 rounded text-[10px] font-bold transition-colors",
                    patient.ktas === k ? cn(KTAS_META[k].bg, "text-white shadow-sm") : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-vuno-bg dark:text-vuno-muted",
                  )}
                >
                  K{k}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 mb-1.5">
              <span className={cn("inline-block px-2.5 py-1 rounded text-[13px] font-bold text-white", meta.bg)}>
                KTAS {patient.ktas} · {meta.label}
              </span>
            </div>
          )}

          {edit ? (
            <input
              value={patient.name}
              onChange={(e) => edit.setName(e.target.value)}
              placeholder="환자명"
              className={cn("w-full text-2xl font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-vuno-border focus:border-brand-500 pb-0.5 placeholder:text-slate-300 dark:placeholder:text-vuno-dim", inlineInput)}
            />
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl font-bold text-slate-900 dark:text-white">{patient.name}</span>
              <span className="text-[15px] text-slate-500 dark:text-vuno-muted font-numeric">
                {patient.sex === "M" ? "남" : "여"} / {patient.age}세
              </span>
            </div>
          )}

          {edit && (
            <div className="flex items-center gap-2 mt-2">
              <div className="flex gap-1">
                {(["M", "F"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => edit.setSex(s)}
                    className={cn(
                      "h-7 w-9 rounded border text-[12px] font-bold transition-colors",
                      patient.sex === s ? "bg-brand-600 border-transparent text-white" : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-vuno-bg dark:border-vuno-border dark:text-vuno-muted",
                    )}
                  >
                    {s === "M" ? "남" : "여"}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={patient.age || ""}
                onChange={(e) => edit.setAge(e.target.value === "" ? "" : Number(e.target.value))}
                placeholder="나이"
                className={cn("w-14 text-[15px] font-numeric text-slate-700 dark:text-slate-200 border-b border-slate-200 dark:border-vuno-border focus:border-brand-500 text-right px-1", inlineInput)}
              />
              <span className="text-[15px] text-slate-500 dark:text-vuno-muted">세</span>
            </div>
          )}
        </div>

        {/* 기본정보 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>기본정보</SidebarLabel>
          {edit ? (
            <>
              <InfoRow label="등록번호" value={
                <input
                  value={patient.mrn ?? ""}
                  onChange={(e) => edit.setSubjectId(e.target.value)}
                  placeholder="MRN"
                  className={cn("w-32 text-right font-numeric text-[15px] text-slate-800 dark:text-white border-b border-slate-200 dark:border-vuno-border focus:border-brand-500 placeholder:text-slate-300", inlineInput)}
                />
              } />
              <InfoRow label="내원 일시" value={
                <input
                  type="datetime-local"
                  value={edit.admission}
                  onChange={(e) => edit.setAdmission(e.target.value)}
                  className={cn("text-[13px] text-slate-800 dark:text-white dark:[color-scheme:dark]", inlineInput)}
                />
              } />
            </>
          ) : (
            <>
              <InfoRow label="등록번호" value={<span className="font-numeric break-all">{patient.mimic?.subject_id ?? patient.mrn ?? patient.id}</span>} />
              {patient.mimic?.subject_id && (
                <InfoRow label="데이터원" value={<span className="text-vuno-cyanDim font-bold">MIMIC-IV</span>} />
              )}
              <InfoRow label="도착시각" value={<span className="whitespace-nowrap">{fmtTime(patient.arrivedAt)}</span>} />
              <InfoRow label="등록시각" value={<span className="whitespace-nowrap">{fmtTime(patient.registeredAt)}</span>} />
            </>
          )}
        </div>

        {/* 주증상 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>주증상 (Chief Complaint){edit && <span className="text-brand-600 ml-0.5">*</span>}</SidebarLabel>
          {edit ? (
            <textarea
              value={patient.chief}
              onChange={(e) => edit.setChief(e.target.value)}
              rows={2}
              placeholder="예: 흉통, 호흡곤란 30분 전 발생"
              className={cn("w-full text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed resize-none border border-slate-200 dark:border-vuno-border rounded-md px-2 py-1.5 focus:border-brand-500 placeholder:text-slate-300", inlineInput)}
            />
          ) : (
            <p className="text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed">{patient.chief}</p>
          )}
        </div>

        {/* 활력징후 — 직사각형 카드 (컴팩트) */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>활력징후 (Vital Signs)</SidebarLabel>
          <div className="grid grid-cols-3 gap-1.5">
            {vitalRows.map(([label, val, unit, abn, key]) => (
              <div key={label} className={cn(
                "rounded-md border px-1.5 py-2 flex flex-col items-center justify-center gap-0.5",
                abn ? "border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/15" : "border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg",
              )}>
                <div className={cn("text-[12px] font-bold tracking-wide whitespace-nowrap", abn ? "text-red-500 dark:text-red-300" : "text-slate-500 dark:text-vuno-muted")}>{label}</div>
                {edit ? (
                  <input
                    type="number"
                    value={val ?? ""}
                    onChange={(e) => edit.setVital(key, e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="—"
                    className={cn("w-full text-center font-numeric font-bold text-[19px] leading-none focus:outline-none placeholder:text-slate-300 dark:placeholder:text-vuno-dim bg-transparent", abn ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-white")}
                  />
                ) : (
                  <div className={cn("font-numeric font-bold text-[19px] leading-none whitespace-nowrap", abn ? "text-red-600 dark:text-red-300" : "text-slate-900 dark:text-white")}>
                    {val ?? "—"}
                  </div>
                )}
                <div className="text-[11px] font-medium text-slate-400 dark:text-vuno-dim whitespace-nowrap">{unit}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 과거력 / 알레르기 */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-vuno-border">
          <SidebarLabel>과거력 / 알레르기</SidebarLabel>
          {edit ? (
            <div className="flex flex-wrap gap-1 mb-2">
              {PAST_HX_CODES.map((code) => {
                const on = (patient.pastHistory ?? []).includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    onClick={() => edit.togglePastHx(code)}
                    title={PAST_HISTORY_LABELS[code]}
                    className={cn(
                      "px-2 py-1 text-[13px] font-bold border rounded transition-colors",
                      on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300 bg-slate-50 text-slate-600 hover:bg-white dark:border-vuno-border dark:bg-vuno-bg dark:text-vuno-muted",
                    )}
                  >
                    {code}
                  </button>
                );
              })}
            </div>
          ) : (patient.pastHistory && patient.pastHistory.length > 0 ? (
            <div className="flex flex-wrap gap-1 mb-2">
              {patient.pastHistory.map((h) => (
                <span key={h} className="px-2 py-1 text-[13px] font-bold bg-slate-100 dark:bg-vuno-bg dark:text-slate-200 border border-slate-300 dark:border-vuno-border rounded" title={PAST_HISTORY_LABELS[h]}>
                  {h}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-slate-400 dark:text-vuno-dim mb-2">과거력 없음</p>
          ))}
          {edit ? (
            <>
              <div className="flex items-center gap-1.5 text-[15px] mb-1.5">
                <span className="text-slate-400 dark:text-vuno-dim flex-shrink-0 font-medium">알레르기</span>
                <input value={patient.allergies ?? ""} onChange={(e) => edit.setAllergies(e.target.value)} placeholder="NKDA"
                  className={cn("flex-1 text-[15px] text-slate-600 dark:text-slate-200 border-b border-slate-200 dark:border-vuno-border focus:border-brand-500 placeholder:text-slate-300", inlineInput)} />
              </div>
              <div className="flex items-center gap-1.5 text-[15px]">
                <span className="text-slate-400 dark:text-vuno-dim flex-shrink-0 font-medium">복용약</span>
                <input value={patient.medications ?? ""} onChange={(e) => edit.setMeds(e.target.value)} placeholder="없음"
                  className={cn("flex-1 text-[15px] text-slate-600 dark:text-slate-200 border-b border-slate-200 dark:border-vuno-border focus:border-brand-500 placeholder:text-slate-300", inlineInput)} />
              </div>
            </>
          ) : (
            <>
              <div className="text-[15px] text-slate-600 dark:text-vuno-muted leading-relaxed">
                <span className="text-slate-400 dark:text-vuno-dim font-medium">알레르기 </span>
                <span className="font-medium text-slate-800 dark:text-white">{patient.allergies || "NKDA"}</span>
              </div>
              {patient.medications && (
                <div className="text-[15px] text-slate-600 dark:text-vuno-muted mt-1 leading-relaxed">
                  <span className="text-slate-400 dark:text-vuno-dim font-medium">복용약 </span>
                  <span className="font-medium text-slate-800 dark:text-white">{patient.medications}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 메모 — 하단 여백 채움. edit(트리아지 입력)에선 단일 입력, 그 외엔 작성자·시각 로그 */}
        <div className="px-4 py-3.5 flex-1 flex flex-col min-h-0">
          <SidebarLabel>메모 (Notes)</SidebarLabel>
          {edit ? (
            <textarea
              value={patient.notes ?? ""}
              onChange={(e) => edit.setNotes(e.target.value)}
              placeholder="환자 특이사항 · 인계 메모를 입력하세요"
              className="flex-1 min-h-[96px] w-full px-3 py-2.5 text-[15px] leading-relaxed border border-slate-200 dark:border-vuno-border rounded-md bg-slate-50 dark:bg-vuno-bg dark:text-white dark:placeholder:text-vuno-dim focus:outline-none focus:border-vuno-cyan focus:bg-white dark:focus:bg-vuno-bg resize-none"
            />
          ) : (
            <MemoLog patient={patientProp} />
          )}
        </div>

        {/* 하단 액션 (트리아지 입력 모드에서만) */}
        {footer && (
          <div className="px-4 py-3 border-t border-slate-200 dark:border-vuno-border">{footer}</div>
        )}
      </div>
    </aside>
  );
}

/* 메모 로그 — 작성자(역할)·시각이 함께 기록되는 인계 노트 (최신 항목 위) */
interface MemoEntry { id: string; author: string; role: string; time: string; text: string; }

function MemoLog({ patient }: { patient: DemoPatient }) {
  const { user } = useAuth();
  const seed = (): MemoEntry[] =>
    patient.notes
      ? [{ id: "seed", author: "트리아지", role: "", time: patient.registeredAt, text: patient.notes }]
      : [];
  const [entries, setEntries] = useState<MemoEntry[]>(seed);
  const [draft, setDraft] = useState("");
  const [time, setTime] = useState(() => toLocalInput(new Date().toISOString())); // 작성 시각 — 직접 지정 가능
  // 환자 변경 시 로그 초기화 (데모 — 세션 한정)
  useEffect(() => { setEntries(seed()); setDraft(""); setTime(toLocalInput(new Date().toISOString())); /* eslint-disable-next-line */ }, [patient.id]);

  function add() {
    const text = draft.trim();
    if (!text) return;
    const role = user?.role === "nurse" ? "간호사" : user?.role === "doctor" ? "의사" : "";
    setEntries((es) => [
      { id: `${Date.now()}`, author: user?.name ?? "당직의", role, time: fromLocalInput(time), text },
      ...es,
    ]);
    setDraft("");
    setTime(toLocalInput(new Date().toISOString()));
  }

  return (
    <>
      {/* 기록 로그 — 남은 공간 채움, 스크롤 */}
      <div className="flex-1 min-h-[80px] overflow-y-auto space-y-2 mb-2.5">
        {entries.length === 0 ? (
          <p className="text-[14px] text-slate-400 dark:text-vuno-dim py-2">기록된 메모가 없습니다.</p>
        ) : entries.map((e) => (
          <div key={e.id} className="rounded-md border border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[13px] font-bold text-slate-700 dark:text-slate-100">
                {e.author}{e.role && <span className="font-medium text-slate-400 dark:text-vuno-dim"> · {e.role}</span>}
              </span>
              <span className="ml-auto text-[12px] font-numeric text-slate-400 dark:text-vuno-dim">{fmtTime(e.time)}</span>
            </div>
            <p className="text-[14px] text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{e.text}</p>
          </div>
        ))}
      </div>
      {/* 입력 — 작성자 자동, 시각은 직접 지정 가능 */}
      <div className="space-y-1.5">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); add(); } }}
          rows={2}
          placeholder="메모 입력 후 기록 (⌘/Ctrl+Enter)"
          className="w-full min-h-[46px] px-3 py-2 text-[14px] leading-relaxed border border-slate-200 dark:border-vuno-border rounded-md bg-slate-50 dark:bg-vuno-bg dark:text-white dark:placeholder:text-vuno-dim focus:outline-none focus:border-vuno-cyan focus:bg-white dark:focus:bg-vuno-bg resize-none"
        />
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            title="작성 시각 (직접 지정 가능)"
            className="flex-1 min-w-0 h-10 px-2.5 text-[13px] font-numeric border border-slate-200 dark:border-vuno-border rounded-md bg-slate-50 dark:bg-vuno-bg text-slate-700 dark:text-white dark:[color-scheme:dark] focus:outline-none focus:border-vuno-cyan"
          />
          <button
            type="button"
            onClick={add}
            disabled={!draft.trim()}
            className="h-10 px-4 rounded-md bg-brand-600 text-white text-[14px] font-bold hover:bg-brand-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-vuno-bg dark:disabled:text-vuno-dim disabled:cursor-not-allowed transition-colors flex-shrink-0"
          >
            기록
          </button>
        </div>
      </div>
    </>
  );
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 mb-2.5 px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border">
      <span className="h-3 w-1 rounded-full bg-brand-500 flex-shrink-0" />
      <span className="text-[14px] font-bold text-slate-700 dark:text-slate-100 tracking-wide whitespace-nowrap">{children}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 text-[15px] py-1 items-center">
      <span className="text-slate-500 dark:text-vuno-muted flex-shrink-0 font-medium">{label}</span>
      <span className="text-slate-800 dark:text-white font-medium text-right">{value}</span>
    </div>
  );
}
