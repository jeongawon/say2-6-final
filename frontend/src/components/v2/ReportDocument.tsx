// say-6 — AI 종합 소견서 (정식 양식)
// ReportEditorPage 의 AI 종합소견 패널에 렌더. 소견 검토 상태면 본문 편집 가능.

import type { DemoPatient } from "../../lib/v2/demoStore";
import type { AIRecommendation } from "./AIRecommendationPanel";
import { useAuth } from "../../lib/v2/auth";

interface Props {
  patient: DemoPatient;
  recommendation?: AIRecommendation;
  edited: string;                          // 향후 치료 의견 본문
  editable: boolean;                       // 소견 검토 상태 → 편집 가능
  onEditedChange: (v: string) => void;
  status: "preliminary" | "reviewed" | "signed" | "amended";
  signature: string;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\.$/, "");
}

// 진단명 → 한국표준질병분류(KCD/ICD) 힌트
export function icdHint(dx?: string): string {
  if (!dx) return "—";
  if (/심방세동|세동|afib|fibrillation/i.test(dx)) return "I48.91";
  if (/고칼륨/i.test(dx)) return "E87.5";
  if (/nstemi|비\s*st/i.test(dx)) return "I21.4";
  if (/stemi|st분절\s*상승/i.test(dx)) return "I21.3";
  if (/심부전|adhf/i.test(dx)) return "I50.9";
  if (/심근경색/i.test(dx)) return "I21.9";
  if (/상기도|감염|uri/i.test(dx)) return "J06.9";
  if (/폐렴|pneumonia/i.test(dx)) return "J18.9";
  if (/두통|headache/i.test(dx)) return "R51";
  return "—";
}

export function ReportDocument({
  patient, recommendation, edited, editable, onEditedChange, status, signature,
}: Props) {
  const chartNo = patient.mimic?.subject_id ?? patient.mrn ?? patient.id;
  const birthYear = new Date().getFullYear() - patient.age;
  const sexLabel = patient.sex === "M" ? "남" : "여";
  const rrn = `${String(birthYear).slice(2)}****-*******`;
  const dx = recommendation?.diagnosis ?? "AI 종합 소견 생성 대기";
  const icd = icdHint(recommendation?.diagnosis);
  const today = fmtDate(new Date().toISOString());
  const arrived = fmtDate(patient.arrivedAt);
  const risk = (recommendation?.risk ?? patient.aiVerdict?.risk ?? "—").toString().toUpperCase();
  const ragCount = recommendation?.similarCases.length ?? 0;
  const { user } = useAuth();
  // 의사 성명 자동 채움 — 로그인한 의사 이름(없으면 기본값). 확정 전에도 미리 기입.
  const doctorName = signature.trim() || user?.name || "정담당";

  return (
    <div className="bg-white border border-slate-400 w-full max-w-[680px] mx-auto text-[14px]">
      {/* 제목 */}
      <div className="px-4 pt-4 pb-2 text-center border-b-2 border-slate-400">
        <div className="text-[26px] font-bold tracking-[0.4em] text-slate-900">소 견 서</div>
        <div className="text-[12px] text-red-600 mt-1">[ 원본대조필인 (印) ]</div>
      </div>

      {/* 환자 정보 */}
      <Row label="차트번호" value={<span className="font-numeric">{chartNo}</span>} />
      <Row label="환자 성명" value={`${patient.name} · ${sexLabel} · 만 ${patient.age}세`} />
      <Row label="주민등록번호" value={<span className="font-numeric">{rrn}</span>} />
      <Row
        label="병 명"
        value={
          <div>
            <div className="font-bold text-red-700 leading-snug text-[15px]">{dx}</div>
            <div className="text-[12px] text-slate-500 mt-1">
              한국질병분류기호(KCD) ·{" "}
              <span className="font-numeric font-bold text-slate-700">{icd}</span>
            </div>
          </div>
        }
      />
      <Row label="발병일 / 초진일" value={<span className="font-numeric">{arrived}</span>} />

      {/* 향후 치료 의견 — 본문 (편집 가능). 자체 스크롤 없이 전체 문서와 함께 스크롤 */}
      <div className="flex flex-col border-b border-slate-300">
        <div className="px-3 py-2 bg-slate-100 border-b border-slate-300 flex items-center gap-2">
          <span className="text-[14px] font-bold text-slate-700">향후 치료 의견</span>
          {editable ? (
            <span className="text-[12px] font-bold text-vuno-cyanDim">✎ 편집 모드</span>
          ) : (
            <span className="text-[12px] text-slate-400">읽기 전용 — 소견 검토 시 편집</span>
          )}
        </div>
        {editable ? (
          <textarea
            value={edited}
            onChange={(e) => onEditedChange(e.target.value)}
            rows={16}
            className="w-full px-3 py-3 text-[14px] leading-relaxed bg-white text-slate-800 focus:outline-none resize-none"
          />
        ) : (
          <div className="px-3 py-3 text-[14px] leading-relaxed text-slate-800 whitespace-pre-wrap min-h-[280px]">
            {edited}
          </div>
        )}
      </div>

      {/* 비고 / 용도 */}
      <Row label="비 고" value={`Risk: ${risk} · AI 보조 분석 적용 · RAG 사례 ${ragCount}건 참조`} />
      <Row label="용 도" value="진료 참고용 (응급실 초기 평가)" last />

      {/* 소견함 + 발행 */}
      <div className="border-t-2 border-slate-400 px-4 py-4">
        <div className="text-center text-[16px] font-bold tracking-[0.3em] text-slate-800 mb-4">
          위 와 같 이 소 견 함
        </div>
        <div className="flex items-end justify-between text-[14px]">
          <div>
            <span className="text-slate-500">발 행 일 </span>
            <span className="font-numeric font-bold text-slate-800">{today}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-500">의사 성명 </span>
            <span className="font-bold text-slate-800">{doctorName}</span>
            {status === "signed" ? (
              <span className="h-11 w-11 grid place-items-center rounded-full border-2 border-red-500 text-red-500 text-[15px] font-bold -rotate-[7deg]">
                印
              </span>
            ) : (
              <span className="h-11 w-11 grid place-items-center rounded-full border-2 border-dashed border-slate-300 text-slate-300 text-[13px]">
                印
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label, value, last,
}: {
  label: string;
  value: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex text-[14px] ${last ? "" : "border-b border-slate-300"}`}>
      <div className="w-28 flex-shrink-0 bg-slate-100 border-r border-slate-300 px-2 py-2.5 font-bold text-slate-600 text-center flex items-center justify-center">
        {label}
      </div>
      <div className="flex-1 px-3 py-2.5 text-slate-800 min-w-0">{value}</div>
    </div>
  );
}
