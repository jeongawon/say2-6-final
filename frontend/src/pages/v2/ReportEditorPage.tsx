import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Activity, Image as ImageIcon, FlaskConical, Sparkles,
  ClipboardCheck, PenLine, Copy, FileText, X, Printer, CheckCircle2,
} from "lucide-react";
import { AppShell } from "../../components/v2/AppShell";
import { PatientInfoSidebar } from "../../components/v2/PatientInfoSidebar";
import { ReportDocument } from "../../components/v2/ReportDocument";
import { ReportPrintSheet } from "../../components/v2/ReportPrintSheet";
import { EcgClinicalSheet } from "../../components/v2/EcgClinicalSheet";
import {
  findPatient,
  setLocalReportStatus, getLocalReportStatus,
  setLocalReportEdits, getLocalReportEdits,
  setLocalReportSignature, getLocalReportSignature,
  type DemoPatient,
} from "../../lib/v2/demoStore";
import { useAuth, canEditReport } from "../../lib/v2/auth";
import {
  getModalResults, generateReport, getReportByEncounter, reviewReport, signReport,
  type ModalResults, type ReportStatus,
} from "../../lib/v2/api";
import { CXRView, ECGView, LabView } from "../../components/modal-views/ModalViews";
import { cn } from "../../lib/cn";

/* ─────────────────────────────────────────────────────────
   say-6 소견서 생성 워크스테이션 — 3-pane
   ① 검사 결과  ② AI 판독결과  ③ AI 종합소견
   ───────────────────────────────────────────────────────── */

type ModalKey = "ECG" | "CXR" | "LAB";

interface VitalRow {
  name: string;
  value: number | null;
  unit: string;
  ref: string;
  flag?: "H" | "L";
}

interface ResultSheet {
  kind: "ECG" | "CXR";
  conclusion: "정상" | "경계" | "이상";
  image: string;
  meta: [string, string][];
  measures?: [string, string, string][]; // 항목 / 측정값 / 참고치
  findings: string[];
  impression: string;
}

interface ExamData {
  vitalNarrative: string;
  ecgMeasures: [string, string][];
  ecgNarrative: string;
  ecgSheet: ResultSheet;
  cxrNarrative: string;
  cxrSheet: ResultSheet;
  labRows: [string, string, "H" | "L" | "", string][]; // 항목 / 값 / 플래그 / 참고치
  labNarrative: string;
}

export default function ReportEditorPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const encounterId = searchParams.get("encounter_id");
  const nav = useNavigate();
  const patient = useMemo(() => findPatient(id), [id]);
  const { user } = useAuth();
  const canEdit = canEditReport(user?.role);

  // ── 백엔드 모달 결과 폴링 + AI 종합소견 ──
  // 로컬 캐시에 이전 검토/서명 상태가 있으면 그 값으로 시작 (정적 데모 환자 보존)
  const [modalResults, setModalResults] = useState<ModalResults | null>(null);
  const [aiNarrative, setAiNarrative] = useState<string | null>(() => getLocalReportEdits(id) ?? null);
  const [reportId, setReportId] = useState<number | null>(null);
  const [reportStatus, setReportStatus] = useState<ReportStatus>(
    () => getLocalReportStatus(id) ?? "preliminary",
  );
  const initialSignature = getLocalReportSignature(id) ?? "";
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!encounterId) return;
    let stopped = false;

    const poll = async () => {
      const res = await getModalResults(encounterId);
      if (stopped || !res) return;
      setModalResults(res);
      if (res.CXR && res.ECG && res.LAB && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    poll();
    pollRef.current = setInterval(poll, 4000);

    // 소견서 — 기존 것이 있으면 그대로 사용(상태·수정 보존), 없으면 신규 생성.
    // 본문 표시 정책: 의사 편집(physician_edits)이 있으면 복원,
    //   그 외에는 양식의 aiDraft 템플릿 사용. Bedrock 장문 ai_diagnosis는 DB 기록용이며 본문엔 표시 안 함.
    (async () => {
      const existing = await getReportByEncounter(encounterId);
      if (stopped) return;
      if (existing) {
        setReportId(existing.id);
        setReportStatus(existing.status);
        if (existing.physician_edits) setAiNarrative(existing.physician_edits);
      } else {
        const r = await generateReport(encounterId);
        if (stopped || !r) return;
        if (r.report_id != null) setReportId(Number(r.report_id));
        setReportStatus("preliminary");
        // r.narrative(Bedrock 장문)는 DB에 ai_diagnosis로 저장되지만 본문엔 사용하지 않음
        // 알림 패널/리스트 즉시 새로고침 — preliminary 상태가 '서명 필요'로 즉시 뜨도록.
        window.dispatchEvent(new Event("say6:reports:invalidate"));
      }
    })();

    return () => {
      stopped = true;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [encounterId]);

  if (!patient) {
    return (
      <AppShell>
        <div className="max-w-md mx-auto py-20 text-center text-slate-500 dark:text-vuno-muted">환자를 찾을 수 없습니다.</div>
      </AppShell>
    );
  }

  return (
    <AppShell notifications={3}>
      {/* 4-컬럼: 환자정보 · 검사결과 · AI 판독결과 · AI 종합소견 — 세로 꽉 채움 */}
      <div className="max-w-[1800px] mx-auto px-5 py-4 grid grid-cols-1 lg:grid-cols-[280px_1fr_1fr_1.1fr] gap-4 items-stretch min-h-[calc(100vh-5rem)]">
        <PatientInfoSidebar patient={patient} />
        <PaneExamResults patient={patient} modalResults={modalResults} />
        <PaneAIAnalysis patient={patient} />
        <PaneAISummary
          patient={patient}
          canEdit={canEdit}
          aiNarrative={aiNarrative}
          reportId={reportId}
          reportStatus={reportStatus}
          initialSignature={initialSignature}
          onGoToReports={() => nav("/demo/reports")}
        />
      </div>
    </AppShell>
  );
}

/* ═════════════════════════════════════════════════════════
   검사 데이터 (데모) — 환자별 수치/서술/결과지
   ═════════════════════════════════════════════════════════ */
function buildExamData(patient: DemoPatient): ExamData {
  const v = patient.vitals;
  const who = `${patient.name} · ${patient.sex === "M" ? "남" : "여"}/${patient.age}`;
  const now = new Date().toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });

  if (patient.id === "042") {
    return {
      vitalNarrative:
        `내원 당시 활력징후는 혈압 ${v.sbp}/${v.dbp} mmHg, 심박수 ${v.hr}회/분, 호흡수 ${v.rr}회/분, ` +
        `산소포화도 ${v.spo2}%, 체온 ${v.bt}℃로 측정되었다. 호흡수 증가와 산소포화도 경계 저하 소견이 ` +
        `관찰되어 환자의 호흡곤란 호소와 일치한다.`,
      ecgMeasures: [
        ["HR", "88 bpm"], ["PR 간격", "160 ms"], ["QRS 폭", "95 ms"], ["QT/QTc", "380 / 412 ms"],
      ],
      ecgNarrative:
        "동성 리듬 88회/분. 전벽 유도(V2–V4)에서 2.5 mm 이상의 ST분절 상승이 관찰되며 하벽 유도에 " +
        "호혜성 ST분절 하강이 동반된다. 급성 ST분절 상승 심근경색(STEMI)에 합당한 소견이다.",
      ecgSheet: {
        kind: "ECG",
        conclusion: "이상",
        image: "/ecg.jpg",
        meta: [
          ["검사", "12-Lead ECG"], ["검사일시", now],
          ["판독", "say-6 DeepECG v1.2"], ["환자", who],
        ],
        measures: [
          ["HR", "88 bpm", "60–100"],
          ["PR 간격", "160 ms", "120–200"],
          ["QRS 폭", "95 ms", "< 120"],
          ["QT / QTc", "380 / 412 ms", "QTc < 450"],
          ["P axis", "58°", "0–75"],
          ["QRS axis", "22°", "-30–90"],
        ],
        findings: [
          "동성 리듬, 심박수 88회/분",
          "V2–V4 유도 ST분절 상승 (최대 2.5 mm)",
          "II, III, aVF 유도 호혜성 ST분절 하강",
          "병적 Q파 미관찰 — 초급성기로 추정",
          "QTc 412 ms, 정상 범위",
        ],
        impression: "급성 전벽 ST분절 상승 심근경색(STEMI) 패턴",
      },
      cxrNarrative:
        "흉부 단순촬영(PA)에서 심흉곽비는 0.52로 경계성 심비대 소견을 보인다. 양측 폐야에 활동성 침윤이나 " +
        "경화 음영은 관찰되지 않으며 늑막삼출 및 기흉 소견도 없다.",
      cxrSheet: {
        kind: "CXR",
        conclusion: "경계",
        image: "/CXR.jpeg",
        meta: [
          ["검사", "Chest PA (단순흉부촬영)"], ["검사일시", now],
          ["판독", "say-6 DeepCXR v2.0"], ["환자", who],
        ],
        findings: [
          "심흉곽비(CTR) 0.52 — 경계성 심비대",
          "양측 폐야 활동성 침윤·경화 음영 없음",
          "늑막삼출 없음",
          "기흉 없음",
          "종격동 폭 정상, 골 구조 이상 없음",
        ],
        impression: "경미한 심비대 외 급성 폐실질 병변 없음",
      },
      labRows: [
        ["Troponin I", "0.82 ng/mL", "H", "< 0.04"],
        ["CK-MB", "12.4 ng/mL", "H", "0.6–6.3"],
        ["WBC", "10.2 ×10³/µL", "H", "4.0–10.0"],
        ["CRP", "0.6 mg/dL", "", "< 0.5"],
        ["Creatinine", "0.9 mg/dL", "", "0.7–1.3"],
        ["BNP", "102 pg/mL", "H", "< 100"],
      ],
      labNarrative:
        "심근효소 검사에서 Troponin I 0.82 ng/mL, CK-MB 12.4 ng/mL로 뚜렷한 상승을 보여 급성 심근손상을 " +
        "시사한다. 백혈구 수치 경미한 상승 외 신기능 수치는 정상 범위에 가깝다.",
    };
  }

  // 정상군 기본값
  return {
    vitalNarrative:
      `내원 당시 활력징후는 혈압 ${v.sbp}/${v.dbp} mmHg, 심박수 ${v.hr}회/분, 호흡수 ${v.rr}회/분, ` +
      `산소포화도 ${v.spo2}%, 체온 ${v.bt}℃로 측정되었으며 전반적으로 안정적인 범위 내에 있다.`,
    ecgMeasures: [
      ["HR", `${v.hr ?? "—"} bpm`], ["PR 간격", "148 ms"], ["QRS 폭", "88 ms"], ["QT/QTc", "372 / 398 ms"],
    ],
    ecgNarrative:
      `동성 리듬 ${v.hr ?? "—"}회/분. ST분절 및 T파 이상 소견은 관찰되지 않으며 전도 장애의 증거도 없다. ` +
      "정상 심전도 소견이다.",
    ecgSheet: {
      kind: "ECG",
      conclusion: "정상",
      image: "/ecg.jpg",
      meta: [
        ["검사", "12-Lead ECG"], ["검사일시", now],
        ["판독", "say-6 DeepECG v1.2"], ["환자", who],
      ],
      measures: [
        ["HR", `${v.hr ?? "—"} bpm`, "60–100"],
        ["PR 간격", "148 ms", "120–200"],
        ["QRS 폭", "88 ms", "< 120"],
        ["QT / QTc", "372 / 398 ms", "QTc < 450"],
        ["P axis", "52°", "0–75"],
        ["QRS axis", "38°", "-30–90"],
      ],
      findings: [
        "동성 리듬, 정상 심박수",
        "ST분절 상승·하강 없음",
        "T파 역전 없음",
        "전도 장애 없음",
      ],
      impression: "정상 심전도",
    },
    cxrNarrative:
      "흉부 단순촬영에서 양측 폐야는 깨끗하며 심장 크기는 정상 범위이다. 늑막삼출, 기흉, 활동성 폐병변 " +
      "소견은 관찰되지 않는다.",
    cxrSheet: {
      kind: "CXR",
      conclusion: "정상",
      image: "/CXR.jpeg",
      meta: [
        ["검사", "Chest PA (단순흉부촬영)"], ["검사일시", now],
        ["판독", "say-6 DeepCXR v2.0"], ["환자", who],
      ],
      findings: [
        "심흉곽비(CTR) 정상 범위",
        "양측 폐야 깨끗함",
        "늑막삼출 없음",
        "기흉 없음",
        "종격동·골 구조 이상 없음",
      ],
      impression: "정상 흉부 X-ray",
    },
    labRows: [
      ["WBC", "8.2 ×10³/µL", "", "4.0–10.0"],
      ["CRP", "0.8 mg/dL", "H", "< 0.5"],
      ["Creatinine", "1.0 mg/dL", "", "0.7–1.3"],
      ["Hb", "14.1 g/dL", "", "13–17"],
      ["Glucose", "98 mg/dL", "", "70–110"],
    ],
    labNarrative:
      "혈액검사에서 백혈구 수치는 정상 범위이며 CRP는 경미하게 상승하였다. 신기능, 혈색소, 혈당은 모두 " +
      "정상 범위로 확인된다.",
  };
}

/* ═════════════════════════════════════════════════════════
   PANE 1 — 검사 결과 (수치형 / 서술형)
   ═════════════════════════════════════════════════════════ */
// AI가 실제 판독한 모달 = recommendation.reasons에 "ECG:/CXR:/LAB:" 접두사가 있는 것.
// (요청·완료된 검사만 검사결과/AI 판독결과에 노출 — 미요청 모달은 숨김)
function readModalsOf(p: DemoPatient): Set<ModalKey> {
  const set = new Set<ModalKey>();
  p.recommendation?.reasons.forEach((r) => {
    const m = r.match(/^(ECG|CXR|LAB)\s*[:：]/);
    if (m) set.add(m[1] as ModalKey);
  });
  return set;
}

function PaneExamResults({
  patient, modalResults,
}: {
  patient: DemoPatient;
  modalResults: ModalResults | null;
}) {
  const read = readModalsOf(patient);
  const data = useMemo(() => buildExamData(patient), [patient]);
  const [view, setView] = useState<"numeric" | "narrative">("numeric");
  const [modalKind, setModalKind] = useState<ModalKey | null>(null);

  const v = patient.vitals;
  const vitalRows: VitalRow[] = [
    { name: "HR (심박수)",   value: v.hr,   unit: "bpm",  ref: "60–100",  flag: flagOf(v.hr, 60, 100) },
    { name: "SBP (수축기)",  value: v.sbp,  unit: "mmHg", ref: "90–140",  flag: flagOf(v.sbp, 90, 140) },
    { name: "DBP (이완기)",  value: v.dbp,  unit: "mmHg", ref: "60–90",   flag: flagOf(v.dbp, 60, 90) },
    { name: "RR (호흡수)",   value: v.rr,   unit: "/min", ref: "12–20",   flag: flagOf(v.rr, 12, 20) },
    { name: "SpO₂ (산소포화)", value: v.spo2, unit: "%",  ref: "95–100",  flag: flagOf(v.spo2, 95, 100) },
    { name: "BT (체온)",     value: v.bt,   unit: "℃",    ref: "36.0–37.5", flag: flagOf(v.bt, 36, 37.5) },
  ];

  return (
    <Pane
      title="검사 결과"
      subtitle="Examination Results"
      icon={ClipboardCheck}
      tone="gray"
      headerRight={
        <div className="flex border border-slate-300 dark:border-vuno-border rounded-lg overflow-hidden">
          {([
            { key: "numeric", label: "수치형" },
            { key: "narrative", label: "서술형" },
          ] as const).map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-bold transition-colors whitespace-nowrap",
                view === t.key
                  ? "bg-slate-700 text-white dark:bg-vuno-elevated"
                  : "bg-white text-slate-500 hover:bg-slate-50 dark:bg-vuno-surface dark:text-vuno-muted dark:hover:bg-vuno-elevated",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {/* ─── 활력징후 ─── */}
      <SectionLabel hint="환자 등록(트리아지) 정보에서 자동 연동">
        활력징후 (Vital Signs)
      </SectionLabel>
      {view === "numeric" ? (
        <table className="w-full text-[12px] border-collapse mb-4">
          <thead>
            <tr className="bg-slate-100 dark:bg-vuno-bg text-slate-600 dark:text-vuno-muted whitespace-nowrap">
              <th className="text-left px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">항목</th>
              <th className="text-right px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">결과</th>
              <th className="text-center px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border w-20">판정</th>
              <th className="text-left px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">참고치</th>
            </tr>
          </thead>
          <tbody>
            {vitalRows.map((r) => (
              <tr key={r.name} className="hover:bg-slate-50 dark:hover:bg-vuno-elevated">
                <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.name}</td>
                <td className={cn("px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-right font-numeric font-bold whitespace-nowrap",
                  r.flag ? "text-red-600" : "text-slate-900 dark:text-white")}>
                  {r.value ?? "—"}<span className="text-[10px] font-normal text-slate-400 dark:text-vuno-dim ml-0.5">{r.unit}</span>
                </td>
                <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-center whitespace-nowrap">
                  {r.flag === "H" ? <span className="text-red-600 font-bold">H · 높음</span>
                    : r.flag === "L" ? <span className="text-blue-600 font-bold">L · 낮음</span>
                    : <span className="text-emerald-600 font-medium">정상</span>}
                </td>
                <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-slate-500 dark:text-vuno-muted font-numeric whitespace-nowrap">{r.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-200 mb-4">{data.vitalNarrative}</p>
      )}

      {/* ─── ECG ─── */}
      {read.has("ECG") && (<>
      <SectionLabel
        action={<SheetButton onClick={() => setModalKind("ECG")} live={!!modalResults?.ECG} />}
      >
        심전도 (ECG · 12-Lead)
      </SectionLabel>
      {view === "numeric" ? (
        <div className="grid grid-cols-2 gap-1.5 mb-4">
          {data.ecgMeasures.map(([k, val]) => (
            <div key={k} className="bg-slate-50 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border px-2 py-1.5">
              <div className="text-[10px] text-slate-500 dark:text-vuno-muted whitespace-nowrap">{k}</div>
              <div className="text-[13px] font-numeric font-bold text-slate-900 dark:text-white whitespace-nowrap">{val}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-200 mb-4">{data.ecgNarrative}</p>
      )}
      </>)}

      {/* ─── CXR ─── */}
      {read.has("CXR") && (<>
      <SectionLabel
        action={<SheetButton onClick={() => setModalKind("CXR")} live={!!modalResults?.CXR} />}
      >
        흉부 X-ray (CXR)
      </SectionLabel>
      {view === "numeric" ? (
        <div className="mb-4 border border-slate-200 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg px-2.5 py-2 flex items-start gap-2">
          <ImageIcon className="h-4 w-4 text-slate-400 dark:text-vuno-dim flex-shrink-0 mt-0.5" />
          <span className="text-[11px] text-slate-500 dark:text-vuno-muted leading-relaxed">
            영상 검사 — 수치 데이터 없음. 판독 결과는 <b className="text-slate-700 dark:text-slate-200">검사결과지</b>에서 확인하세요.
          </span>
        </div>
      ) : (
        <p className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-200 mb-4">{data.cxrNarrative}</p>
      )}
      </>)}

      {/* ─── LAB ─── */}
      {read.has("LAB") && (<>
      <SectionLabel
        hint="응급 혈액검사 · 별도 채혈 결과"
        action={<SheetButton onClick={() => setModalKind("LAB")} live={!!modalResults?.LAB} />}
      >
        혈액 검사 (LAB)
      </SectionLabel>
      {view === "numeric" ? (
        <table className="w-full text-[12px] border-collapse">
          <thead>
            <tr className="bg-slate-100 dark:bg-vuno-bg text-slate-600 dark:text-vuno-muted whitespace-nowrap">
              <th className="text-left px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">항목</th>
              <th className="text-right px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">결과</th>
              <th className="text-left px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">참고치</th>
            </tr>
          </thead>
          <tbody>
            {data.labRows.map(([name, val, flag, ref]) => (
              <tr key={name} className="hover:bg-slate-50 dark:hover:bg-vuno-elevated">
                <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-slate-700 dark:text-slate-200 whitespace-nowrap">{name}</td>
                <td className={cn("px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-right font-numeric font-bold whitespace-nowrap",
                  flag ? "text-red-600" : "text-slate-900 dark:text-white")}>
                  {val}{flag && <span className="ml-1 text-red-600">{flag}</span>}
                </td>
                <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-slate-500 dark:text-vuno-muted font-numeric whitespace-nowrap">{ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-[12px] leading-relaxed text-slate-700 dark:text-slate-200">{data.labNarrative}</p>
      )}
      </>)}

      {modalKind && (
        <ExamResultModal
          kind={modalKind}
          backendResult={modalResults?.[modalKind] ?? null}
          subjectId={patient.mimic?.subject_id ?? null}
          staticSheet={
            modalKind === "ECG" ? data.ecgSheet :
            modalKind === "CXR" ? data.cxrSheet : null
          }
          onClose={() => setModalKind(null)}
        />
      )}
    </Pane>
  );
}

function SheetButton({ onClick, live }: { onClick: () => void; live?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 border border-vuno-cyan/50 text-vuno-cyanDim hover:bg-vuno-cyan/10 text-[10px] font-bold transition-colors whitespace-nowrap flex-shrink-0"
    >
      <FileText className="h-3 w-3 flex-shrink-0" />
      <span>검사결과지</span>
      {live && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 flex-shrink-0" title="백엔드 실시간 연동" />}
    </button>
  );
}

function flagOf(v: number | null, lo: number, hi: number): "H" | "L" | undefined {
  if (v == null) return undefined;
  if (v > hi) return "H";
  if (v < lo) return "L";
  return undefined;
}

/* ─────────────────────────────────────────────────────────
   검사결과지 모달 — 백엔드 연동 시 레거시 ECG/CXR/LAB 뷰,
   미연동 시 정적 데모 판독지(ResultSheetBody)
   ───────────────────────────────────────────────────────── */
function ExamResultModal({
  kind, backendResult, subjectId, staticSheet, onClose,
}: {
  kind: ModalKey;
  backendResult: import("../../components/modal-views/ModalViews").ModalRawResponse | null;
  subjectId: string | null;
  staticSheet: ResultSheet | null;
  onClose: () => void;
}) {
  const title =
    kind === "ECG" ? "12-Lead 심전도 검사결과지" :
    kind === "CXR" ? "흉부 X-ray 판독결과지" : "혈액 검사 결과지";

  // 백엔드 데이터가 있으면 레거시 모달 뷰를 그대로 사용
  const hasBackend = !!backendResult;
  const wide = hasBackend || kind === "LAB";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
      onClick={onClose}
    >
      <div
        className={cn(
          "bg-white dark:bg-vuno-surface w-full max-h-[90vh] overflow-auto border border-slate-300 dark:border-vuno-border shadow-2xl",
          wide ? "max-w-4xl" : "max-w-2xl",
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-300 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg sticky top-0 z-10">
          <FileText className="h-4 w-4 text-vuno-cyanDim" />
          <span className="text-sm font-bold text-slate-900 dark:text-white">{title}</span>
          {hasBackend ? (
            <span className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold border bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> 백엔드 실시간
            </span>
          ) : (
            <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold border bg-slate-100 dark:bg-vuno-bg border-slate-300 dark:border-vuno-border text-slate-500 dark:text-vuno-muted">
              데모 데이터
            </span>
          )}
          <button onClick={onClose} className="ml-auto text-slate-400 dark:text-vuno-dim hover:text-slate-700 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        {hasBackend ? (
          /* ── 레거시 모달 뷰 (백엔드 ModalRawResponse 그대로 렌더) ── */
          <div className="p-3">
            <div className="relative h-[560px] border border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface overflow-hidden">
              {kind === "ECG" && <ECGView ecgResult={backendResult} isLoading={false} />}
              {kind === "CXR" && (
                <CXRView subjectId={subjectId} cacheKey="" cxrResult={backendResult} isLoading={false} />
              )}
              {kind === "LAB" && <LabView labResult={backendResult} isLoading={false} />}
            </div>
            <div className="text-[9px] text-slate-400 dark:text-vuno-dim pt-2">
              ecg-svc / chest-svc-pre / lab-svc 의 실시간 판독 응답입니다.
            </div>
          </div>
        ) : staticSheet ? (
          <ResultSheetBody sheet={staticSheet} />
        ) : (
          /* LAB 백엔드 미연동 — 인라인 표 안내 */
          <div className="p-8 text-center text-[12px] text-slate-500 dark:text-vuno-muted">
            백엔드 미연동 — 혈액 검사 수치는 좌측 패널의 표에서 확인하세요.
            <div className="text-[10px] text-slate-400 dark:text-vuno-dim mt-1">
              백엔드 연결 시 룰엔진 결과 + 6시간 후 악화 예측 그래프가 표시됩니다.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ResultSheetBody({ sheet }: { sheet: ResultSheet }) {
  const concClass =
    sheet.conclusion === "이상" ? "bg-red-50 dark:bg-red-500/15 border-red-300 dark:border-red-500/40 text-red-700 dark:text-red-300" :
    sheet.conclusion === "경계" ? "bg-amber-50 dark:bg-amber-500/15 border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-300" :
                                  "bg-emerald-50 dark:bg-emerald-500/15 border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300";
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className={cn("px-1.5 py-0.5 text-[10px] font-bold border", concClass)}>
          {sheet.conclusion}
        </span>
      </div>

      {/* 검사 정보 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
        {sheet.meta.map(([k, val]) => (
          <div key={k} className="flex gap-2">
            <span className="text-slate-500 dark:text-vuno-muted w-14 flex-shrink-0">{k}</span>
            <span className="text-slate-800 dark:text-white font-medium">{val}</span>
          </div>
        ))}
      </div>

      {/* 검사 시각화 — ECG는 임상용 종이 시트, CXR은 이미지 */}
      {sheet.kind === "ECG" ? (
        <div className="border border-slate-300 dark:border-vuno-border overflow-hidden">
          {(() => {
            // meta에서 환자/일시 정보 추출 (buildExamData 형식: "이름 · 남/30")
            const patientLine =
              sheet.meta.find(([k]) => k === "환자")?.[1] ?? "";
            const tsLine =
              sheet.meta.find(([k]) => k === "검사일시")?.[1];
            const m = patientLine.match(/(.+?)\s*·\s*(남|여)\s*\/\s*(\d+)/);
            const name = m?.[1] ?? "환자";
            const sex = m?.[2] === "여" ? "F" : "M";
            const age = m ? parseInt(m[3], 10) : 0;
            // measures에서 hr / pr / qrs / qt / qtc / axis 추출
            const measureMap = new Map(
              (sheet.measures ?? []).map(([k, v]) => [k, v]),
            );
            const num = (v?: string) =>
              v ? parseInt(v.replace(/[^0-9.]/g, ""), 10) : undefined;
            const qtField = measureMap.get("QT / QTc") ?? "";
            const [qt, qtc] = qtField.match(/\d+/g) ?? [];
            return (
              <EcgClinicalSheet
                patientName={name}
                sex={sex}
                age={age}
                recordedAt={tsLine}
                hr={num(measureMap.get("HR"))}
                prInterval={num(measureMap.get("PR 간격"))}
                qrsWidth={num(measureMap.get("QRS 폭"))}
                qt={qt ? parseInt(qt, 10) : undefined}
                qtc={qtc ? parseInt(qtc, 10) : undefined}
                pAxis={num(measureMap.get("P axis"))}
                qrsAxis={num(measureMap.get("QRS axis"))}
                interpretation={[
                  { code: "1100", text: "Sinus rhythm" },
                  {
                    code: "9110",
                    text:
                      sheet.conclusion === "정상"
                        ? "** normal ECG **"
                        : `** ${sheet.impression} **`,
                  },
                ]}
              />
            );
          })()}
        </div>
      ) : (
        <div className="border border-slate-300 dark:border-vuno-border bg-black overflow-hidden">
          <img
            src={sheet.image}
            alt="흉부 X-ray"
            className="w-full h-72 object-contain bg-black"
          />
        </div>
      )}

      {/* 측정값 (ECG) */}
      {sheet.measures && (
        <div>
          <SectionLabel>측정값 (Measurements)</SectionLabel>
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-slate-100 dark:bg-vuno-bg text-slate-600 dark:text-vuno-muted">
                <th className="text-left px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">항목</th>
                <th className="text-right px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">측정값</th>
                <th className="text-left px-2 py-1.5 font-semibold border border-slate-200 dark:border-vuno-border">참고치</th>
              </tr>
            </thead>
            <tbody>
              {sheet.measures.map(([k, val, ref]) => (
                <tr key={k} className="hover:bg-slate-50 dark:hover:bg-vuno-elevated">
                  <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-slate-700 dark:text-slate-200">{k}</td>
                  <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-right font-numeric font-bold text-slate-900 dark:text-white">{val}</td>
                  <td className="px-2 py-1.5 border border-slate-200 dark:border-vuno-border text-slate-500 dark:text-vuno-muted font-numeric">{ref}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 판독 소견 */}
      <div>
        <SectionLabel>판독 소견 (Findings)</SectionLabel>
        <ul className="space-y-1">
          {sheet.findings.map((f) => (
            <li key={f} className="text-[11px] text-slate-700 dark:text-slate-200 flex gap-1.5">
              <span className="text-vuno-cyanDim font-bold flex-shrink-0">·</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 결론 */}
      <div className="border border-slate-300 dark:border-vuno-border bg-slate-50 dark:bg-vuno-bg px-3 py-2.5">
        <SectionLabel>결론 (Impression)</SectionLabel>
        <div className="text-[12px] font-bold text-slate-900 dark:text-white">{sheet.impression}</div>
      </div>

      <div className="text-[9px] text-slate-400 dark:text-vuno-dim pt-1 border-t border-slate-200 dark:border-vuno-border">
        본 결과지는 say-6 AI 판독 보조 시스템이 생성한 참고용 자료이며, 최종 판독은 의료진의 검토를 따릅니다.
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════
   PANE 2 — AI 판독결과 (모달별)
   ═════════════════════════════════════════════════════════ */
function PaneAIAnalysis({ patient }: { patient: DemoPatient }) {
  const reasonMap = useMemo(() => {
    const map: Partial<Record<ModalKey, string>> = {};
    patient.recommendation?.reasons.forEach((r) => {
      const m = r.match(/^(ECG|CXR|LAB)\s*[:：]\s*(.+)$/);
      if (m) map[m[1] as ModalKey] = m[2];
    });
    return map;
  }, [patient]);

  // AI가 실제 판독한 모달만 노출 (reasons 접두사 기준) — 미요청 모달 숨김
  const allModals: Array<{ key: ModalKey; icon: typeof Activity; conf: number }> = [
    { key: "ECG", icon: Activity,     conf: patient.id === "042" ? 0.89 : 0.85 },
    { key: "CXR", icon: ImageIcon,    conf: patient.id === "042" ? 0.94 : 0.91 },
    { key: "LAB", icon: FlaskConical, conf: patient.id === "042" ? 0.92 : 0.88 },
  ];
  const modals = allModals.filter((m) => reasonMap[m.key]);

  return (
    <Pane title="AI 판독결과" subtitle="AI Analysis · Per Modality" icon={Sparkles} tone="brand">
      <div className="space-y-2.5">
        {modals.length === 0 && (
          <div className="text-[11px] text-slate-400 dark:text-vuno-dim py-6 text-center">판독된 검사가 없습니다.</div>
        )}
        {modals.map((m) => {
          const status = patient[m.key.toLowerCase() as "ecg" | "cxr" | "lab"];
          const summary = reasonMap[m.key];
          const isCritical = patient.recommendation?.risk === "critical" && m.key === "ECG";
          return (
            <div key={m.key} className="border border-slate-200 dark:border-vuno-border bg-white dark:bg-vuno-surface">
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 dark:bg-vuno-bg border-b border-slate-200 dark:border-vuno-border">
                <m.icon className="h-3.5 w-3.5 text-slate-600 dark:text-vuno-muted" />
                <span className="text-[11px] font-bold text-slate-800 dark:text-white">{m.key}</span>
                <span className="text-[9px] text-slate-400 dark:text-vuno-dim">
                  {m.key === "ECG" ? "심전도 12-Lead" : m.key === "CXR" ? "흉부 X-ray" : "혈액 검사"}
                </span>
                <span className={cn(
                  "ml-auto text-[11px] font-numeric font-bold",
                  m.conf >= 0.9 ? "text-emerald-600" : "text-amber-600",
                )}>
                  {Math.round(m.conf * 100)}%
                </span>
              </div>
              <div className="px-2.5 py-2">
                {status === "running" ? (
                  <div className="text-[11px] text-slate-400 dark:text-vuno-dim italic">분석 중…</div>
                ) : summary ? (
                  <div className="flex gap-1.5">
                    {isCritical && <span className="text-red-600 flex-shrink-0">⚠</span>}
                    <span className={cn("text-[11px] leading-relaxed", isCritical ? "text-red-700 font-medium" : "text-slate-700 dark:text-slate-200")}>
                      {summary}
                    </span>
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 dark:text-vuno-dim">판독 결과 없음</div>
                )}
                {status !== "running" && (
                  <div className="mt-2 h-1 bg-slate-200 dark:bg-vuno-elevated overflow-hidden">
                    <div
                      className={cn("h-full", m.conf >= 0.9 ? "bg-emerald-500" : "bg-amber-500")}
                      style={{ width: `${m.conf * 100}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {patient.recommendation && patient.recommendation.similarCases.length > 0 && (
        <>
          <SectionLabel className="mt-4">RAG 유사 사례</SectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {patient.recommendation.similarCases.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 px-2 py-1 bg-slate-50 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border text-[10px]">
                <span className="font-numeric text-slate-700 dark:text-slate-200">{c.id}</span>
                <span className="text-slate-400 dark:text-vuno-dim">·</span>
                <span className="font-numeric font-bold text-vuno-cyanDim">{Math.round(c.similarity * 100)}%</span>
              </span>
            ))}
          </div>
        </>
      )}
    </Pane>
  );
}

/* ═════════════════════════════════════════════════════════
   PANE 3 — AI 종합소견 (탭 + 편집 + 서명)
   ═════════════════════════════════════════════════════════ */
// 소견서 진행 단계 — 초안 → 검토 → 서명 → EMR 전송
type StepKey = "preliminary" | "reviewed" | "signed" | "emr";
const STATUS_STEPS: { key: StepKey; label: string }[] = [
  { key: "preliminary", label: "초안" },
  { key: "reviewed",    label: "검토" },
  { key: "signed",      label: "서명" },
  { key: "emr",         label: "EMR 전송" },
];

function PaneAISummary({
  patient, canEdit, aiNarrative, reportId, reportStatus, initialSignature, onGoToReports,
}: {
  patient: DemoPatient;
  canEdit: boolean;
  aiNarrative: string | null;
  reportId: number | null;
  reportStatus: ReportStatus;
  initialSignature: string;
  onGoToReports: () => void;
}) {
  const rec = patient.recommendation;

  const aiDraft = useMemo(() => {
    const today = new Date()
      .toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })
      .replace(/\.$/, "");
    if (!rec) {
      return [
        `상기 인은 ${today} 본원 응급실에 내원하여 시행한 검사 및 진찰 결과 다음과 같이 소견드립니다.`,
        ``,
        `[진단 요약]`,
        `AI 멀티모달 분석이 진행 중입니다. ECG · CXR · LAB 판독이 완료되면 종합 소견이 자동 생성됩니다.`,
        ``,
        `[향후 치료 권고]`,
        `검사 결과 도착 후 권고 사항이 생성됩니다.`,
      ].join("\n");
    }
    return [
      `상기 인은 ${today} 본원 응급실에 내원하여 시행한 검사 및 진찰 결과 다음과 같이 소견드립니다.`,
      ``,
      `[진단 요약]`,
      `${patient.age}세 ${patient.sex === "M" ? "남성" : "여성"} 환자가 "${patient.chief}"를 주소로 내원함. ` +
        `${rec.reasons.join(". ")}.`,
      ``,
      `[향후 치료 권고]`,
      ...rec.recommendations.map((r, i) => `${i + 1}. ${r}`),
      ``,
      `※ 본 소견서는 AI 보조 분석에 기반한 초안(preliminary)이며, 최종 진단 및 치료 결정은 담당 의사의 임상 판단에 따릅니다.`,
    ].join("\n");
  }, [patient, rec]);

  const [edited, setEdited] = useState(aiDraft);
  const [status, setStatus] = useState<ReportStatus>(reportStatus);
  const [signature, setSignature] = useState(initialSignature);
  const [busy, setBusy] = useState(false);
  const [emrPopup, setEmrPopup] = useState(false);
  // 서명 완료 = 초안·검토·서명·EMR전송 4단계 모두 완료 처리
  const stepIdx = status === "signed" ? 3 : STATUS_STEPS.findIndex((s) => s.key === status);

  // 백엔드에서 로드한 상태/본문 동기화
  useEffect(() => { setStatus(reportStatus); }, [reportStatus]);
  useEffect(() => { if (aiNarrative) setEdited(aiNarrative); }, [aiNarrative]);
  // 로컬 상태 캐시 — 환자 목록/종합소견서 페이지가 즉시 반영하도록.
  // "preliminary"는 캐시 안 함: ReportEditor 가 마운트만 해도 leak 되어 환자 목록에
  // "작성 가능"으로 잘못 표시되는 문제 방지. 검토·서명 등 실제 상태 전이만 캐시.
  useEffect(() => {
    if (status !== "preliminary") setLocalReportStatus(patient.id, status);
  }, [patient.id, status]);
  useEffect(() => { setLocalReportEdits(patient.id, edited); }, [patient.id, edited]);
  useEffect(() => {
    if (signature.trim()) setLocalReportSignature(patient.id, signature);
  }, [patient.id, signature]);

  // 초안 상태에선 수정 불가 — '소견 검토'를 눌러 검토 상태로 진입해야 편집 가능
  const editable = canEdit && status === "reviewed";
  const canFinalize = canEdit && status === "reviewed" && signature.trim().length > 0 && !busy;

  // 소견 검토 — 백엔드 PATCH /reports/{id}/review (백엔드 미연동 시 로컬 전이)
  async function handleReview() {
    setBusy(true);
    if (reportId != null) await reviewReport(reportId, edited);
    setStatus("reviewed");
    setBusy(false);
  }
  // 소견 확정 — 백엔드 POST /reports/{id}/sign → FHIR final = EMR 전송
  async function handleSign() {
    setBusy(true);
    if (reportId != null) await signReport(reportId, signature.trim() || "physician", edited);
    setStatus("signed");
    setBusy(false);
    setEmrPopup(true); // EMR 전송 안내 팝업 — 페이지 이동 없음
  }

  return (
    <>
    <Pane
      title="AI 종합소견"
      subtitle="AI Diagnostic Report"
      icon={PenLine}
      tone="brand"
      headerRight={
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => window.print()}
            title="소견서 인쇄 / PDF 저장"
            className="h-7 w-7 grid place-items-center rounded-lg border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-vuno-border dark:bg-vuno-surface dark:text-vuno-muted dark:hover:bg-vuno-elevated transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
          </button>
          <button
            disabled={!canEdit || status !== "preliminary" || busy}
            onClick={handleReview}
            className={cn(
              "h-7 px-3 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap",
              status === "preliminary" && canEdit && !busy
                ? "bg-brand-600 text-white hover:bg-brand-700"
                : "bg-slate-200 text-slate-400 dark:bg-vuno-bg dark:text-vuno-dim cursor-not-allowed",
            )}
          >
            소견 검토
          </button>
          <button
            disabled={!canFinalize}
            onClick={handleSign}
            title={
              status === "signed" ? "이미 서명·EMR 전송 완료" :
              status !== "reviewed" ? "먼저 '소견 검토'를 진행하세요" :
              !signature.trim() ? "서명 입력 후 확정할 수 있습니다" : ""
            }
            className={cn(
              "h-7 px-3 rounded-lg text-[11px] font-bold transition-colors whitespace-nowrap",
              canFinalize
                ? "bg-slate-900 text-white hover:bg-black dark:bg-brand-600 dark:hover:bg-brand-700"
                : "bg-slate-200 text-slate-400 dark:bg-vuno-bg dark:text-vuno-dim cursor-not-allowed",
            )}
          >
            소견 확정 · EMR 전송
          </button>
        </div>
      }
    >
      {/* 상태 진행 단계 — 초안 → 검토 → 서명 → EMR 전송 */}
      <div className="flex items-center gap-1 mb-3">
        {STATUS_STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-1">
            <span className={cn(
              "inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold whitespace-nowrap",
              i < stepIdx  ? "bg-slate-200 text-slate-500 dark:bg-vuno-elevated dark:text-vuno-muted" :
              i === stepIdx ? (
                status === "signed"   ? "bg-emerald-600 text-white" :
                status === "reviewed" ? "bg-blue-600 text-white" :
                                        "bg-amber-500 text-white"
              ) : "bg-slate-100 text-slate-400 dark:bg-vuno-bg dark:text-vuno-dim",
            )}>
              <span className="font-numeric">{i + 1}</span> {s.label}
            </span>
            {i < STATUS_STEPS.length - 1 && (
              <span className={cn("text-[10px]", i < stepIdx ? "text-slate-400 dark:text-vuno-dim" : "text-slate-300 dark:text-vuno-dim")}>›</span>
            )}
          </div>
        ))}
        <span className="ml-auto text-[10px] text-slate-500 dark:text-vuno-muted whitespace-nowrap">
          {status === "preliminary" ? "AI 생성 · 검토 전" :
           status === "reviewed"    ? "의사 검토 중" :
                                      "서명 · EMR 전송 완료"}
        </span>
      </div>

      {/* AI 배지 */}
      <div className="flex items-center gap-1.5 mb-2">
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-vuno-cyan/10 border border-vuno-cyan/40 text-[10px] font-bold text-vuno-cyanDim">
          <Sparkles className="h-2.5 w-2.5" /> AI {rec ? Math.round(rec.confidence * 100) : "—"}%
        </span>
        <span className="text-[11px] text-slate-500 dark:text-vuno-muted">Bedrock Claude · RAG 종합 생성</span>
        <button className="ml-auto text-slate-400 dark:text-vuno-dim hover:text-slate-600 dark:hover:text-vuno-muted" title="복사">
          <Copy className="h-3 w-3" />
        </button>
      </div>

      {/* 정식 소견서 양식 — 소견 검토 시 본문 편집 가능 */}
      <div className="flex-1 min-h-0">
        <ReportDocument
          patient={patient}
          recommendation={rec}
          edited={edited}
          editable={editable}
          onEditedChange={setEdited}
          status={status}
          signature={signature}
        />
      </div>

      {!canEdit && (
        <div className="mt-2 text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-500/15 border border-amber-200 dark:border-amber-500/40 px-2 py-1.5">
          ⚠ 읽기 전용 — 소견서 편집·확정은 의사 권한이 필요합니다.
        </div>
      )}

      {canEdit && status === "preliminary" && (
        <div className="mt-2 text-[10px] text-slate-600 dark:text-vuno-muted bg-slate-50 dark:bg-vuno-bg border border-slate-200 dark:border-vuno-border px-2 py-1.5">
          상단 <b className="text-slate-800 dark:text-white">소견 검토</b> 버튼을 누르면 소견서 본문을 수정할 수 있습니다.
        </div>
      )}

      {canEdit && status === "reviewed" && (
        <div className="mt-2 pt-2 border-t border-slate-200 dark:border-vuno-border">
          <div className="flex items-center gap-2">
            <PenLine className="h-3.5 w-3.5 text-slate-400 dark:text-vuno-dim flex-shrink-0" />
            <input
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              placeholder="담당 의사 성명 입력 (예: 정OO)"
              className="flex-1 h-7 px-2 text-[11px] border border-slate-300 dark:border-vuno-border bg-white dark:bg-vuno-bg dark:text-white focus:outline-none focus:border-vuno-cyan"
            />
          </div>
          <div className="mt-1 text-[10px] text-slate-500 dark:text-vuno-muted">
            {signature.trim()
              ? "서명 입력 완료 — 상단 소견 확정 버튼으로 EMR 전송할 수 있습니다."
              : "서명을 입력해야 소견 확정이 활성화됩니다."}
          </div>
        </div>
      )}
    </Pane>

    {/* A4 인쇄 전용 시트 — 화면에선 숨김, 인쇄 시에만 표시 */}
    <ReportPrintSheet
      patient={patient}
      recommendation={rec}
      narrative={edited}
      status={status}
      signature={signature}
    />

    {/* EMR 전송 완료 팝업 */}
    {emrPopup && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
        <div className="bg-white dark:bg-vuno-surface w-full max-w-sm border border-slate-300 dark:border-vuno-border shadow-2xl">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-vuno-border flex items-center gap-2">
            <span className="h-9 w-9 grid place-items-center bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 rounded-full">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div>
              <div className="text-sm font-bold text-slate-900 dark:text-white">EMR 전송 완료</div>
              <div className="text-[11px] text-slate-500 dark:text-vuno-muted">소견서 서명 · 외부 EMR 연동</div>
            </div>
          </div>
          <div className="px-5 py-4 text-[12px] text-slate-700 dark:text-slate-200 leading-relaxed">
            소견서가 <b className="text-slate-900 dark:text-white">서명 완료</b> 처리되었습니다.
            FHIR DiagnosticReport 상태가 <span className="font-numeric">final</span>로 전이되어
            외부 EMR 연동 대상으로 전송되었습니다.
            <div className="mt-2 text-[11px] text-slate-500 dark:text-vuno-muted">
              · 환자: {patient.name} ({patient.mimic?.subject_id ?? patient.mrn ?? patient.id})<br />
              · 처리 시각: {new Date().toLocaleString("ko-KR", { hour: "2-digit", minute: "2-digit", month: "2-digit", day: "2-digit" })}
            </div>
          </div>
          <div className="px-5 py-3 border-t border-slate-200 dark:border-vuno-border flex gap-2 justify-end">
            <button
              onClick={() => setEmrPopup(false)}
              className="h-8 px-4 text-[12px] font-bold border border-slate-300 dark:border-vuno-border text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-vuno-elevated"
            >
              이 소견서 계속 보기
            </button>
            <button
              onClick={() => { setEmrPopup(false); onGoToReports(); }}
              className="h-8 px-4 text-[12px] font-bold bg-brand-600 text-white hover:bg-brand-700"
            >
              종합소견서 목록으로
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────
   공통 — Pane 컨테이너 / SectionLabel
   ───────────────────────────────────────────────────────── */
function Pane({
  title, subtitle, icon: Icon, tone = "gray", headerRight, children,
}: {
  title: string;
  subtitle: string;
  icon: typeof Activity;
  /** brand = AI 검사 권고와 동일한 연보라 / gray = 연한 회색 */
  tone?: "gray" | "brand";
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const headBg = tone === "brand"
    ? "bg-brand-50 dark:bg-brand-500/15"
    : "bg-slate-100 dark:bg-vuno-bg";
  const iconCls = tone === "brand" ? "text-brand-600" : "text-slate-500 dark:text-vuno-muted";
  return (
    <section className="bg-white dark:bg-vuno-surface border border-slate-200 dark:border-vuno-border rounded-xl shadow-sm overflow-hidden flex flex-col">
      <header className={cn(
        "px-3 py-2.5 flex items-center gap-2 border-b border-slate-200 dark:border-vuno-border",
        headBg,
      )}>
        <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", iconCls)} />
        <div className="min-w-0">
          <div className="text-[15px] font-bold text-slate-900 dark:text-white leading-none whitespace-nowrap">{title}</div>
          <div className="text-[10px] text-slate-400 dark:text-vuno-dim tracking-wider uppercase mt-0.5 whitespace-nowrap">{subtitle}</div>
        </div>
        {headerRight && <div className="ml-auto flex-shrink-0">{headerRight}</div>}
      </header>
      <div className="p-3 flex-1 flex flex-col min-h-0">{children}</div>
    </section>
  );
}

function SectionLabel({
  className, children, hint, action,
}: {
  className?: string;
  children: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-center gap-1.5 mb-1.5", className)}>
      <span className="text-[11px] font-bold text-slate-600 dark:text-vuno-muted whitespace-nowrap">{children}</span>
      {hint && <span className="text-[10px] text-slate-400 dark:text-vuno-dim font-normal truncate">· {hint}</span>}
      {action && <span className="ml-auto">{action}</span>}
    </div>
  );
}
