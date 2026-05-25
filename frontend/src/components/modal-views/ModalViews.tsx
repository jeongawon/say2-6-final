// say-6 — 모달 결과 뷰 (ECG / CXR / LAB)
// 레거시 DashboardPage 에서 추출 — 레거시/v2 데모 양쪽에서 재사용.
// 백엔드 chest-svc-pre / ecg-svc / lab-svc 의 PredictResponse(ModalRawResponse)를 그대로 받아 렌더.

import { useState, useEffect, useRef } from "react";
import { AlertTriangle, FlaskConical, HeartPulse } from "lucide-react";

// ── 백엔드 응답 (chest-svc-pre/ecg-svc/lab-svc PredictResponse) ───
export type ModalRawResponse = Record<string, unknown> & {
  status?: string;
  modal?: string;
  risk_level?: string;
  summary?: string;
  findings?: Array<Record<string, unknown>>;
  measurements?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  impression?: string;
  findings_text?: string;
  lab_summary?: Array<Record<string, unknown>>;
};

export function CXRView({
  subjectId,
  cacheKey,
  cxrResult,
  isLoading,
}: {
  subjectId: string | null;
  cacheKey: string;
  cxrResult: ModalRawResponse | null;
  isLoading: boolean;
}) {
  const [showSeg, setShowSeg] = useState(true);
  const [showMeasure, setShowMeasure] = useState(true);

  // 데모 케이스가 아니거나 아직 분석 전이면 단순 이미지/그라디언트
  if (!subjectId) {
    return (
      <div className="absolute inset-0 bg-gradient-to-b from-gray-900 via-gray-700 to-gray-900">
        <div className="absolute inset-x-1/4 inset-y-[15%] bg-gradient-to-b from-gray-500/40 via-gray-400/30 to-gray-500/40 rounded-[40%]" />
      </div>
    );
  }

  const meta = (cxrResult?.metadata || {}) as Record<string, unknown>;
  const m = (cxrResult?.measurements || {}) as Record<string, unknown>;
  const lines = (m.ctr_lines || {}) as Record<string, number>;
  const trach = (m.trachea_coords || {}) as Record<string, number | string | boolean | null>;
  const diaph = (m.diaphragm_coords || {}) as { left?: [number, number]; right?: [number, number] };
  const cp = (m.cp_angle_coords || {}) as { left?: [number, number]; right?: [number, number] };
  const medC = (m.mediastinum_coords || {}) as { x_left?: number; x_right?: number; y_level?: number };

  // 이미지 크기 (W, H) — chest-svc-pre 응답 image_size 그대로
  const imgSize = (meta.image_size as [number, number]) || [3056, 2544];
  const [W, H] = imgSize;

  // /mimic/* 는 CloudFront가 ALB(백엔드)로 라우팅 → 운영에서도 이미지 로드됨.
  // (/assets/* 는 S3로 가서 SPA index.html이 반환되어 CXR 이미지가 깨졌었음.)
  const cxrSrc = `/mimic/cxr/${subjectId}${cacheKey ? `?v=${cacheKey}` : ""}`;
  const maskSrc = meta.mask_base64
    ? `data:image/png;base64,${meta.mask_base64 as string}`
    : null;

  const view = (meta.view as string | undefined) ?? "PA";
  const riskLevel = (cxrResult?.risk_level as string | undefined) ?? "routine";

  // 분석 결과가 아직 없으면 원본 이미지만 보여줌
  if (!cxrResult) {
    return (
      <>
        <img
          src={cxrSrc}
          alt={`CXR ${subjectId}`}
          className="absolute inset-0 w-full h-full object-contain bg-black"
          loading="lazy"
        />
        <div className="absolute bottom-2 left-2 text-[10px] text-gray-400 font-mono">
          MIMIC-CXR · subject_id={subjectId} · {view} View ·{" "}
          {isLoading ? "AI 분석 중..." : "의사 승인 대기 중"}
        </div>
      </>
    );
  }

  // 좌표 헬퍼 — undefined 안전
  const has = (...keys: string[]) => keys.every((k) => typeof lines[k] === "number");

  const heartW = has("heart_left_x", "heart_right_x")
    ? Math.round(lines.heart_right_x - lines.heart_left_x)
    : (m.heart_width_px as number | undefined) ?? 0;
  const thoraxW = has("thorax_left_x", "thorax_right_x")
    ? Math.round(lines.thorax_right_x - lines.thorax_left_x)
    : (m.thorax_width_px as number | undefined) ?? 0;

  const ctrVal = m.ctr as number | undefined;
  const ctrStatus = m.ctr_status as string | undefined;

  const leftCpStatus = m.left_cp_status as string | undefined;
  const leftCpAngle = m.left_cp_angle as number | undefined;
  const rightCpStatus = m.right_cp_status as string | undefined;
  const rightCpAngle = m.right_cp_angle as number | undefined;

  // 종격동 / 기관 / 횡격막 상태값
  const medStatus = m.mediastinum_status as string | undefined;
  const tracheaDevDir =
    (m.trachea_deviation_direction as string | undefined) ??
    (trach.deviation_direction as string | undefined) ??
    null;
  const tracheaDeviated = tracheaDevDir === "left" || tracheaDevDir === "right";
  const diaphStatus = m.diaphragm_status as string | undefined;

  // 횡격막 좌우 높이차 (Y 차이) — diaphragm asymmetry
  const diaphYDiff =
    diaph.left && diaph.right
      ? Math.abs(Math.round((diaph.left[1] as number) - (diaph.right[1] as number)))
      : 0;
  const diaphElevated = diaphStatus === "elevated_left" || diaphStatus === "elevated_right";

  // 종격동 너비
  const medWidth =
    typeof medC.x_left === "number" && typeof medC.x_right === "number"
      ? Math.round(medC.x_right - medC.x_left)
      : 0;

  // SVG 텍스트 크기 — viewBox 픽셀 기준 (3000px 가정)
  const FS = Math.round(Math.max(W, H) * 0.018);   // 본문 텍스트
  const FS_BIG = Math.round(Math.max(W, H) * 0.022);
  const STROKE = Math.round(Math.max(W, H) * 0.0035);

  // 위험도 배지 색
  const riskBadge =
    riskLevel === "critical"
      ? "bg-red-600 border-red-800 text-white"
      : riskLevel === "urgent"
      ? "bg-amber-500 border-amber-700 text-black"
      : "bg-emerald-600 border-emerald-800 text-white";
  const riskLabel =
    riskLevel === "critical" ? "CRITICAL" : riskLevel === "urgent" ? "URGENT" : "ROUTINE";

  return (
    <>
      {/* 1) 원본 흉부 X-ray — HTML <img>로 깔아 안정적으로 렌더 */}
      <img
        src={cxrSrc}
        alt={`CXR ${subjectId}`}
        className="absolute inset-0 w-full h-full object-contain bg-black"
        loading="lazy"
      />
      {/* 2) UNet 세그멘테이션 마스크 — 같은 viewBox SVG로 오버레이 */}
      {showSeg && maskSrc && (
        <img
          src={maskSrc}
          alt="segmentation"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={{ mixBlendMode: "screen", opacity: 0.45 }}
        />
      )}
      {/* 3) 측정선·라벨 — SVG로 좌표 기반 오버레이 */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 w-full h-full pointer-events-none"
      >

        {showMeasure && (
          <>
            {/* 3) 흉곽 가로 (파란 점선) */}
            {has("thorax_left_x", "thorax_right_x", "thorax_row") && (
              <g>
                <line
                  x1={lines.thorax_left_x}
                  y1={lines.thorax_row}
                  x2={lines.thorax_right_x}
                  y2={lines.thorax_row}
                  stroke="#3b82f6"
                  strokeWidth={STROKE}
                  strokeDasharray={`${STROKE * 4} ${STROKE * 2}`}
                />
                <LabelBadge
                  x={(lines.thorax_left_x + lines.thorax_right_x) / 2}
                  y={lines.thorax_row - FS_BIG * 1.2}
                  text={`흉곽 ${thoraxW}px`}
                  color="#3b82f6"
                  fontSize={FS_BIG}
                />
              </g>
            )}

            {/* 4) 심장 가로 (빨강 굵게) */}
            {has("heart_left_x", "heart_right_x", "heart_row") && (
              <g>
                <line
                  x1={lines.heart_left_x}
                  y1={lines.heart_row}
                  x2={lines.heart_right_x}
                  y2={lines.heart_row}
                  stroke="#ef4444"
                  strokeWidth={STROKE * 1.4}
                />
                <LabelBadge
                  x={(lines.heart_left_x + lines.heart_right_x) / 2}
                  y={lines.heart_row - FS_BIG * 1.0}
                  text={`심장 ${heartW}px`}
                  color="#ef4444"
                  fontSize={FS_BIG}
                />
              </g>
            )}

            {/* 5) 종격동 가로 (노란 점선) */}
            {typeof medC.x_left === "number" &&
              typeof medC.x_right === "number" &&
              typeof medC.y_level === "number" && (
                <g>
                  <line
                    x1={medC.x_left}
                    y1={medC.y_level}
                    x2={medC.x_right}
                    y2={medC.y_level}
                    stroke="#facc15"
                    strokeWidth={STROKE}
                    strokeDasharray={`${STROKE * 3} ${STROKE * 2}`}
                  />
                  <LabelBadge
                    x={(medC.x_left + medC.x_right) / 2}
                    y={medC.y_level + FS_BIG * 1.6}
                    text={`종격동 ${medWidth}px${medStatus ? ` (${medStatus})` : ""}`}
                    color="#facc15"
                    fontSize={FS}
                  />
                </g>
              )}

            {/* 6) CTR 배지 (이미지 우상단) */}
            {ctrVal !== undefined && (
              <g>
                <rect
                  x={W - FS_BIG * 8.5}
                  y={FS_BIG * 4}
                  width={FS_BIG * 8}
                  height={FS_BIG * 2}
                  fill="#000"
                  stroke={ctrStatus === "elevated" ? "#ef4444" : "#fff"}
                  strokeWidth={STROKE * 0.6}
                  rx={FS_BIG * 0.2}
                />
                <text
                  x={W - FS_BIG * 4.5}
                  y={FS_BIG * 5.5}
                  fill="#fff"
                  fontSize={FS_BIG * 1.2}
                  textAnchor="middle"
                  fontWeight="bold"
                  fontFamily="monospace"
                >
                  CTR = {ctrVal.toFixed(2)}
                  {ctrStatus === "elevated" ? "  ⚠" : ""}
                </text>
              </g>
            )}

            {/* 7) 기관 세로 — 정중이면 보라 점선, 편위면 빨강 점선 + 방향 라벨 */}
            {typeof trach.thorax_center_x === "number" &&
              typeof trach.y_start === "number" &&
              typeof trach.y_end === "number" && (
                <g>
                  {/* 흉곽 중심선 — 보라 (참조선) */}
                  <line
                    x1={trach.thorax_center_x as number}
                    y1={trach.y_start as number}
                    x2={trach.thorax_center_x as number}
                    y2={trach.y_end as number}
                    stroke="#a855f7"
                    strokeWidth={STROKE * 0.7}
                    strokeDasharray={`${STROKE * 2} ${STROKE * 2}`}
                    opacity={0.5}
                  />
                  {/* 기관 실제 위치 — 편위 시 빨간 굵은 선 */}
                  {tracheaDeviated && typeof trach.mediastinum_center_x === "number" ? (
                    <>
                      <line
                        x1={trach.mediastinum_center_x as number}
                        y1={trach.y_start as number}
                        x2={trach.mediastinum_center_x as number}
                        y2={trach.y_end as number}
                        stroke="#ef4444"
                        strokeWidth={STROKE * 1.2}
                        strokeDasharray={`${STROKE * 4} ${STROKE * 2}`}
                      />
                      <LabelBadge
                        x={trach.mediastinum_center_x as number}
                        y={(trach.y_start as number) - FS}
                        text={`기관 편위 (${tracheaDevDir})`}
                        color="#ef4444"
                        fontSize={FS}
                      />
                    </>
                  ) : (
                    <LabelBadge
                      x={trach.thorax_center_x as number}
                      y={(trach.y_start as number) - FS}
                      text="기관 정중"
                      color="#a855f7"
                      fontSize={FS}
                    />
                  )}
                </g>
              )}

            {/* 8) 횡격막 (파란 점선) — 비대칭 시 차이 라벨 */}
            {diaph.left && diaph.right && (
              <g>
                <line
                  x1={diaph.left[0]}
                  y1={diaph.left[1]}
                  x2={diaph.right[0]}
                  y2={diaph.right[1]}
                  stroke={diaphElevated ? "#f97316" : "#60a5fa"}
                  strokeWidth={STROKE}
                  strokeDasharray={`${STROKE * 3} ${STROKE * 2}`}
                />
                {/* 라벨 — 이미지에서 viewer's left = patient's right */}
                <text
                  x={diaph.left[0]}
                  y={diaph.left[1] + FS * 1.5}
                  fill={diaphElevated ? "#f97316" : "#60a5fa"}
                  fontSize={FS}
                  textAnchor="start"
                  fontWeight="bold"
                >
                  우(R) 횡격막
                </text>
                <text
                  x={diaph.right[0]}
                  y={diaph.right[1] + FS * 1.5}
                  fill={diaphElevated ? "#f97316" : "#60a5fa"}
                  fontSize={FS}
                  textAnchor="end"
                  fontWeight="bold"
                >
                  좌(L) 횡격막
                </text>
                {/* 비대칭 차이 라벨 */}
                {diaphElevated && diaphYDiff > 0 && (
                  <LabelBadge
                    x={(diaph.left[0] + diaph.right[0]) / 2}
                    y={(diaph.left[1] + diaph.right[1]) / 2 + FS * 2.5}
                    text={`${diaphYDiff}px차 (${diaphStatus})`}
                    color="#f97316"
                    fontSize={FS}
                  />
                )}
              </g>
            )}

            {/* 9) 늑횡각 (CP angle) — 좌/우 각도 + 정상 표시 */}
            {cp.right && cp.right[0] > 0 && cp.right[1] > 0 && rightCpAngle !== undefined && (
              <g>
                <circle cx={cp.right[0]} cy={cp.right[1]} r={STROKE * 2} fill="#22c55e" />
                <LabelBadge
                  x={cp.right[0]}
                  y={cp.right[1] - FS}
                  text={`우 CP ${rightCpAngle.toFixed(1)}°(${rightCpStatus === "normal" ? "정상" : rightCpStatus ?? "-"})`}
                  color="#22c55e"
                  fontSize={FS}
                  anchor="start"
                />
              </g>
            )}
            {cp.left && cp.left[0] > 0 && cp.left[1] > 0 && leftCpAngle !== undefined && (
              <g>
                <circle cx={cp.left[0]} cy={cp.left[1]} r={STROKE * 2} fill="#22c55e" />
                <LabelBadge
                  x={cp.left[0]}
                  y={cp.left[1] - FS}
                  text={`좌 CP ${leftCpAngle.toFixed(1)}°(${leftCpStatus === "normal" ? "정상" : leftCpStatus ?? "-"})`}
                  color="#22c55e"
                  fontSize={FS}
                  anchor="end"
                />
              </g>
            )}
          </>
        )}

        {/* 메타 정보 (좌하단) */}
        <text
          x={FS}
          y={H - FS * 0.5}
          fill="#9ca3af"
          fontSize={FS * 0.75}
          fontFamily="monospace"
        >
          MIMIC-CXR · subject_id={subjectId} · {view} View · UNet+측정값
        </text>
      </svg>

      {/* HTML 오버레이 — 좌상단 배지 (위험도 + View) */}
      <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
        <span className={`px-2 py-0.5 text-[10px] font-bold border tracking-widest ${riskBadge}`}>
          {riskLabel}
        </span>
        <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-900/90 text-gray-100 border border-gray-600 tracking-widest">
          {view} VIEW
        </span>
      </div>

      {/* HTML 오버레이 — 우상단 토글 버튼 */}
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setShowSeg((v) => !v)}
          className={`px-2 py-0.5 text-[10px] font-bold border tracking-wide ${
            showSeg
              ? "bg-blue-600 text-white border-blue-800"
              : "bg-gray-800/80 text-gray-300 border-gray-600"
          }`}
        >
          세그멘테이션
        </button>
        <button
          type="button"
          onClick={() => setShowMeasure((v) => !v)}
          className={`px-2 py-0.5 text-[10px] font-bold border tracking-wide ${
            showMeasure
              ? "bg-blue-600 text-white border-blue-800"
              : "bg-gray-800/80 text-gray-300 border-gray-600"
          }`}
        >
          측정선
        </button>
      </div>

      {/* HTML 오버레이 — 하단 색상 범례 */}
      {showMeasure && (
        <div className="absolute bottom-2 right-2 flex items-center gap-2 bg-black/70 border border-gray-700 px-2 py-1 text-[10px] font-bold text-gray-100 pointer-events-none">
          <LegendDot color="#3b82f6" label="흉곽" />
          <LegendDot color="#ef4444" label="심장" />
          <LegendDot color="#facc15" label="종격동" />
          <LegendDot color="#a855f7" label="기관" />
          <LegendDot color="#60a5fa" label="횡격막" />
          <LegendDot color="#22c55e" label="CP각" />
        </div>
      )}
    </>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}

// SVG 라벨 — 검정 배경 + 컬러 텍스트 (의료영상 가독성)
function LabelBadge({
  x,
  y,
  text,
  color,
  fontSize,
  anchor = "middle",
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  anchor?: "start" | "middle" | "end";
}) {
  // 텍스트 길이 추정 — monospace 가정
  const padX = fontSize * 0.4;
  const padY = fontSize * 0.25;
  const w = text.length * fontSize * 0.6 + padX * 2;
  const h = fontSize + padY * 2;
  const rectX = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return (
    <g>
      <rect
        x={rectX}
        y={y - h}
        width={w}
        height={h}
        fill="#000"
        opacity={0.75}
        rx={fontSize * 0.15}
      />
      <text
        x={x}
        y={y - padY}
        fill={color}
        fontSize={fontSize}
        textAnchor={anchor}
        fontWeight="bold"
        fontFamily="sans-serif"
      >
        {text}
      </text>
    </g>
  );
}

// AiTiA / 의료 ECG 페이퍼 톤 — 12-Lead 표준 레이아웃
//   col 1: I, II, III   (Limb)
//   col 2: aVR, aVL, aVF (Augmented)
//   col 3: V1, V2, V3   (Precordial 1)
//   col 4: V4, V5, V6   (Precordial 2)
const ECG_4COL_LAYOUT: { col: number; row: number; name: string; index: number }[] = [
  { col: 0, row: 0, name: "I",   index: 0 },
  { col: 0, row: 1, name: "II",  index: 1 },
  { col: 0, row: 2, name: "III", index: 2 },
  { col: 1, row: 0, name: "aVR", index: 3 },
  { col: 1, row: 1, name: "aVL", index: 4 },
  { col: 1, row: 2, name: "aVF", index: 5 },
  { col: 2, row: 0, name: "V1",  index: 6 },
  { col: 2, row: 1, name: "V2",  index: 7 },
  { col: 2, row: 2, name: "V3",  index: 8 },
  { col: 3, row: 0, name: "V4",  index: 9 },
  { col: 3, row: 1, name: "V5",  index: 10 },
  { col: 3, row: 2, name: "V6",  index: 11 },
];

export function ECGView({
  ecgResult,
  isLoading,
}: {
  ecgResult: ModalRawResponse | null;
  isLoading: boolean;
}) {
  if (!ecgResult) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#fdf6ed]">
        <HeartPulse size={64} className="text-rose-300 opacity-50" />
        <p className="absolute bottom-3 left-3 text-[11px] text-gray-500 font-mono">
          12-Lead · 25mm/s · 10mm/mV ·{" "}
          {isLoading ? "AI 분석 중..." : "의사 승인 대기 중"}
        </p>
      </div>
    );
  }

  const waveform = (ecgResult.waveform as number[][] | undefined) ?? [];
  const vitals = (ecgResult.ecg_vitals || {}) as {
    heart_rate?: number;
    bradycardia?: boolean;
    tachycardia?: boolean;
    irregular_rhythm?: boolean;
  };

  if (waveform.length === 0 || !Array.isArray(waveform[0])) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-[#fdf6ed] text-gray-700 text-[11px] font-mono">
        파형 데이터 없음
      </div>
    );
  }

  const T = waveform.length;
  const leadII = waveform.map((row) => row[1]);

  // 위험도 종합
  const status: "normal" | "tachy" | "irregular" =
    vitals.tachycardia ? "tachy" : vitals.irregular_rhythm ? "irregular" : "normal";
  const statusBadge =
    status === "tachy"
      ? { ko: "빈맥 (Tachycardia)", color: "bg-red-100 border-red-500 text-red-800" }
      : status === "irregular"
      ? { ko: "불규칙 (Irregular Rhythm)", color: "bg-amber-100 border-amber-500 text-amber-800" }
      : { ko: "정상 동성 리듬 (NSR)", color: "bg-emerald-100 border-emerald-500 text-emerald-800" };

  return (
    <div className="absolute inset-0 bg-[#fdf6ed] flex flex-col">
      {/* ── 상단 헤더 — 환자 vitals + 상태 (AiTiA 톤) ──────── */}
      <div className="bg-white border-b-2 border-gray-300 px-3 py-1.5 flex items-center gap-3 text-[12px] flex-wrap">
        <div className="flex items-center gap-2">
          <HeartPulse
            size={16}
            className={status === "tachy" ? "text-red-600 animate-pulse-soft" : "text-emerald-600"}
          />
          <span className="text-[20px] font-bold leading-none text-gray-900">
            {vitals.heart_rate?.toFixed(0) ?? "--"}
          </span>
          <span className="text-[11px] text-gray-500 self-end pb-0.5">bpm</span>
        </div>
        <div className="w-px h-5 bg-gray-300" />
        <span className={`px-2 py-0.5 text-[11px] font-bold border-l-4 ${statusBadge.color}`}>
          {statusBadge.ko}
        </span>
        {vitals.tachycardia && vitals.irregular_rhythm && (
          <span className="px-1.5 py-0.5 text-[10px] font-bold bg-red-100 border border-red-400 text-red-700">
            빈맥 + 불규칙 동시
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[10px] text-gray-500 font-mono">
          12-Lead · 25mm/s · 10mm/mV
        </span>
      </div>

      {/* ── 4×3 12-Lead 그리드 ─────────────────────────────── */}
      <div className="flex-1 grid grid-cols-4 grid-rows-3 gap-0 px-2 pt-1.5 min-h-0">
        {ECG_4COL_LAYOUT.map(({ name, index }) => {
          const data = waveform.map((row) => row[index]);
          return <LeadTile key={name} name={name} data={data} samples={T} />;
        })}
      </div>

      {/* ── 하단 Lead II 실시간 리듬 스트립 (캔버스 sweep) ── */}
      <div className="bg-[#fdf6ed] border-t-2 border-rose-300 h-[18%] min-h-[70px] relative overflow-hidden">
        <RhythmCanvas
          data={leadII}
          irregular={!!vitals.irregular_rhythm}
          tachycardia={!!vitals.tachycardia}
        />
        <div className="absolute top-1 left-2 text-[10px] font-bold text-gray-700 z-10 bg-white/80 px-1.5">
          II 리듬 · 실시간
        </div>
      </div>
    </div>
  );
}

// 1-lead 작은 트레이스 — 의료 ECG 페이퍼 톤 (cream + pink grid + black trace)
function LeadTile({ name, data, samples }: { name: string; data: number[]; samples: number }) {
  const W = 360;
  const H = 80;
  const padY = 5;
  const yMin = -1.5;
  const yMax = 1.5;
  const step = W / Math.max(samples - 1, 1);

  const points = data
    .map((v, i) => {
      const x = i * step;
      const clamped = Math.max(yMin, Math.min(yMax, v));
      const y = padY + ((yMax - clamped) / (yMax - yMin)) * (H - 2 * padY);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  // 1mV 캘리브레이션 펄스
  const calibY = padY + ((yMax - 1) / (yMax - yMin)) * (H - 2 * padY);
  const calibBaseY = padY + ((yMax - 0) / (yMax - yMin)) * (H - 2 * padY);

  const gridId = `ecg-grid-${name.replace(/\W/g, "")}`;

  return (
    <div className="bg-[#fdf6ed] relative overflow-hidden border-r border-b border-rose-200/60 last:border-r-0">
      <span className="absolute top-1 left-1.5 text-[11px] font-bold text-gray-700 font-mono z-10 bg-white/80 px-1 rounded-sm">
        {name}
      </span>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="w-full h-full"
      >
        {/* AiTiA / 표준 ECG 페이퍼 그리드 — 작은 칸(1mm 핑크) + 큰 칸(5mm 진핑크) */}
        <defs>
          <pattern id={`${gridId}-sm`} width={W / 50} height={H / 10} patternUnits="userSpaceOnUse">
            <path
              d={`M ${W / 50} 0 L 0 0 0 ${H / 10}`}
              fill="none"
              stroke="#f5c6c6"
              strokeWidth="0.4"
            />
          </pattern>
          <pattern id={`${gridId}-lg`} width={W / 10} height={H / 2} patternUnits="userSpaceOnUse">
            <rect width={W / 10} height={H / 2} fill={`url(#${gridId}-sm)`} />
            <path
              d={`M ${W / 10} 0 L 0 0 0 ${H / 2}`}
              fill="none"
              stroke="#e08585"
              strokeWidth="0.7"
            />
          </pattern>
        </defs>
        <rect width={W} height={H} fill={`url(#${gridId}-lg)`} />

        {/* 1mV 캘리브레이션 펄스 (좌측 끝, 검정) */}
        <polyline
          points={`2,${calibBaseY} 2,${calibY} 10,${calibY} 10,${calibBaseY}`}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="1"
        />

        {/* 트레이스 — 검정 (의료 ECG 표준) */}
        <polyline
          points={points}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth="1.1"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

// Lead II 리듬 스트립 — cream paper + pink grid + black trace, sweep 애니메이션
function RhythmCanvas({
  data,
  irregular,
  tachycardia,
}: {
  data: number[];
  irregular: boolean;
  tachycardia: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 빈맥/불규칙 → 트레이스 색 변화 (검정 기본 + 강조 시 빨강/주황)
  const traceColor = tachycardia ? "#dc2626" : irregular ? "#d97706" : "#1a1a1a";
  const sweepFadeColor = "rgba(253, 246, 237, 0.85)";
  const bgColor = "#fdf6ed";
  const gridSm = "#f5c6c6";
  const gridLg = "#e08585";

  useEffect(() => {
    if (data.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;
    ctx.scale(dpr, dpr);

    const W = cssW;
    const H = cssH;
    const padY = 6;
    const yMin = -1.5;
    const yMax = 1.5;

    const SWEEP_MS = 5000;  // 5초에 한 바퀴 (라이브 모니터링)

    function yPos(v: number) {
      const c = Math.max(yMin, Math.min(yMax, v));
      return padY + ((yMax - c) / (yMax - yMin)) * (H - 2 * padY);
    }

    let raf = 0;
    let start: number | null = null;

    function drawGrid() {
      // 작은 칸 (1mm)
      ctx!.strokeStyle = gridSm;
      ctx!.lineWidth = 0.3;
      const smX = W / 50;
      const smY = H / 10;
      for (let x = 0; x <= W; x += smX) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, H);
        ctx!.stroke();
      }
      for (let y = 0; y <= H; y += smY) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(W, y);
        ctx!.stroke();
      }
      // 큰 칸 (5mm)
      ctx!.strokeStyle = gridLg;
      ctx!.lineWidth = 0.7;
      const lgX = W / 10;
      const lgY = H / 2;
      for (let x = 0; x <= W; x += lgX) {
        ctx!.beginPath();
        ctx!.moveTo(x, 0);
        ctx!.lineTo(x, H);
        ctx!.stroke();
      }
      for (let y = 0; y <= H; y += lgY) {
        ctx!.beginPath();
        ctx!.moveTo(0, y);
        ctx!.lineTo(W, y);
        ctx!.stroke();
      }
    }

    // 매 프레임 전체 클리어 → 0~sweepX 까지 트레이스 그림 → 커서 헤드 점.
    // sweep이 W까지 도달하면 끝(오른쪽 끝)까지 트레이스가 가득 차고 다음 사이클로 wrap.
    function frame(ts: number) {
      if (start === null) start = ts;
      const elapsed = (ts - start) % SWEEP_MS;
      const sweepX = (elapsed / SWEEP_MS) * W;

      // 매 프레임 전체 클리어 + 그리드 다시
      ctx!.fillStyle = bgColor;
      ctx!.fillRect(0, 0, W, H);
      drawGrid();

      const samples = data.length;
      const xToIdx = (x: number) => Math.floor((x / W) * samples);

      // 0 ~ sweepX 까지 트레이스 (가는 선, 한 번만)
      ctx!.strokeStyle = traceColor;
      ctx!.lineWidth = 1.1;
      ctx!.lineJoin = "round";
      ctx!.lineCap = "round";
      ctx!.beginPath();
      let first = true;
      for (let x = 0; x <= sweepX; x += 1) {
        const idx = xToIdx(x);
        const v = data[idx] ?? 0;
        const y = yPos(v);
        if (first) {
          ctx!.moveTo(x, y);
          first = false;
        } else {
          ctx!.lineTo(x, y);
        }
      }
      ctx!.stroke();

      // 커서 헤드 점
      const headIdx = xToIdx(sweepX);
      const headY = yPos(data[headIdx] ?? 0);
      ctx!.fillStyle = traceColor;
      ctx!.beginPath();
      ctx!.arc(sweepX, headY, 2.5, 0, Math.PI * 2);
      ctx!.fill();

      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [data, traceColor, sweepFadeColor, bgColor, gridSm, gridLg]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />;
}

// 혈액검사 항목 한글 라벨
const LAB_FEATURE_KO: Record<string, string> = {
  wbc: "WBC (백혈구)",
  hemoglobin: "Hemoglobin (혈색소)",
  platelet: "Platelet (혈소판)",
  creatinine: "Creatinine (크레아티닌)",
  bun: "BUN (혈중요소질소)",
  sodium: "Sodium (Na+)",
  potassium: "Potassium (K+)",
  glucose: "Glucose (혈당)",
  ast: "AST",
  alt: "ALT",
  albumin: "Albumin",
  lactate: "Lactate",
  calcium: "Calcium (Ca)",
  troponin_t: "Troponin T",
  ntprobnp: "NT-proBNP",
  ck_mb: "CK-MB",
  crp: "CRP",
};

// 6h 예측 메트릭 한글 라벨
const PROG_KO: Record<string, string> = {
  hemoglobin_down: "Hemoglobin 감소",
  creatinine_up: "Creatinine 증가",
  potassium_worse: "Potassium 악화",
  lactate_up: "Lactate 증가",
  troponin_up: "Troponin 상승",
};

export function LabView({
  labResult,
  isLoading,
}: {
  labResult: ModalRawResponse | null;
  isLoading: boolean;
}) {
  const [subTab, setSubTab] = useState<"rule" | "prog">("rule");

  if (!labResult) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-amber-100 to-amber-50">
        <FlaskConical size={64} className="text-amber-600 opacity-40" />
        <p className="absolute bottom-3 left-3 text-[11px] text-gray-600 font-mono">
          CBC · BMP · Cardiac Markers ·{" "}
          {isLoading ? "AI 분석 중..." : "의사 승인 대기 중"}
        </p>
      </div>
    );
  }

  const labSummary = (labResult.lab_summary as Array<{
    feature: string;
    value: number | null;
    unit: string;
    reference_low: number | null;
    reference_high: number | null;
    status: string;
    measured: boolean;
  }>) ?? [];
  const prognosis = (labResult.prognosis_6h || null) as
    | {
        hemoglobin_down?: number;
        creatinine_up?: number;
        potassium_worse?: number;
        lactate_up?: number;
        troponin_up?: number;
        warnings?: string[];
        troponin_note?: string | null;
      }
    | null;

  return (
    <div className="absolute inset-0 bg-white flex flex-col">
      {/* 서브탭 */}
      <div className="flex border-b border-gray-300 bg-gray-100 shrink-0">
        <SubTabButton
          active={subTab === "rule"}
          onClick={() => setSubTab("rule")}
          label="룰엔진 결과"
          count={labSummary.filter((l) => l.measured).length}
        />
        <SubTabButton
          active={subTab === "prog"}
          onClick={() => setSubTab("prog")}
          label="6시간 후 악화 예측"
          count={prognosis ? 5 : 0}
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {subTab === "rule" ? (
          <LabRuleTable items={labSummary} />
        ) : (
          <LabPrognosisChart prognosis={prognosis} />
        )}
      </div>
    </div>
  );
}

function SubTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-4 py-1.5 text-[12px] font-bold border-r border-gray-300 transition-colors",
        active
          ? "bg-white text-blue-800 border-b-2 border-b-blue-700 -mb-px"
          : "text-gray-600 hover:bg-gray-50",
      ].join(" ")}
    >
      {label}
      <span className="ml-1 text-[10px] font-mono opacity-70">{count}</span>
    </button>
  );
}

// 룰엔진 결과 테이블 — 의료 lab 결과 톤 (Min/Max/Result/Status + Range 막대)
function LabRuleTable({
  items,
}: {
  items: Array<{
    feature: string;
    value: number | null;
    unit: string;
    reference_low: number | null;
    reference_high: number | null;
    status: string;
    measured: boolean;
  }>;
}) {
  return (
    <table className="w-full text-[11px] border-collapse">
      <thead className="sticky top-0 bg-gray-200 z-10">
        <tr className="border-b border-gray-400 text-gray-800">
          <th className="text-left px-2 py-1.5 w-[28%]">Name</th>
          <th className="text-left px-2 py-1.5 w-[8%]">Unit</th>
          <th className="text-right px-2 py-1.5 w-[8%]">Min</th>
          <th className="text-right px-2 py-1.5 w-[8%]">Max</th>
          <th className="text-right px-2 py-1.5 w-[10%]">Result</th>
          <th className="text-center px-2 py-1.5 w-[10%]">Status</th>
          <th className="text-left px-2 py-1.5">Range</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it) => {
          const koLabel = LAB_FEATURE_KO[it.feature] || it.feature;
          const isHigh = it.status.includes("high");
          const isLow = it.status.includes("low");
          const isCritical = it.status.includes("critical");
          const statusColor = isCritical
            ? "text-red-700 font-bold"
            : isHigh
            ? "text-red-600 font-bold"
            : isLow
            ? "text-blue-600 font-bold"
            : "text-gray-800";
          const statusKo = isCritical
            ? "Critical"
            : isHigh
            ? "High"
            : isLow
            ? "Low"
            : !it.measured
            ? "—"
            : "Norm";

          return (
            <tr
              key={it.feature}
              className={[
                "border-b border-gray-200",
                isCritical
                  ? "bg-red-50"
                  : isHigh
                  ? "bg-red-50/40"
                  : isLow
                  ? "bg-blue-50/40"
                  : "",
              ].join(" ")}
            >
              <td className={`px-2 py-1 ${isCritical || isHigh ? "text-red-700" : isLow ? "text-blue-700" : "text-gray-800"} font-medium`}>
                {koLabel}
              </td>
              <td className="px-2 py-1 font-mono text-gray-600">{it.unit || "—"}</td>
              <td className="px-2 py-1 text-right font-mono text-gray-600">
                {it.reference_low ?? "—"}
              </td>
              <td className="px-2 py-1 text-right font-mono text-gray-600">
                {it.reference_high ?? "—"}
              </td>
              <td className={`px-2 py-1 text-right font-mono ${statusColor}`}>
                {it.measured ? it.value : "—"}
              </td>
              <td className={`px-2 py-1 text-center font-mono ${statusColor}`}>{statusKo}</td>
              <td className="px-2 py-1">
                <RangeBar
                  value={it.value}
                  min={it.reference_low}
                  max={it.reference_high}
                  status={it.status}
                  measured={it.measured}
                />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// 정상 범위 시각화 — 검정 막대로 현재 값, 양 끝은 정상 한계
function RangeBar({
  value,
  min,
  max,
  status,
  measured,
}: {
  value: number | null;
  min: number | null;
  max: number | null;
  status: string;
  measured: boolean;
}) {
  if (!measured || value == null || min == null || max == null) {
    return <div className="w-full h-2 bg-gray-100" />;
  }
  // 외곽 (min - max 범위 좌우 25% 마진)
  const margin = (max - min) * 0.25;
  const lo = min - margin;
  const hi = max + margin;
  const span = hi - lo;
  const pct = Math.max(0, Math.min(100, ((value - lo) / span) * 100));
  const minPct = ((min - lo) / span) * 100;
  const maxPct = ((max - lo) / span) * 100;
  const isHigh = status.includes("high");
  const isLow = status.includes("low");
  const isCritical = status.includes("critical");
  const barColor = isCritical
    ? "bg-red-700"
    : isHigh
    ? "bg-red-500"
    : isLow
    ? "bg-blue-500"
    : "bg-gray-800";

  return (
    <div className="relative w-full h-3 bg-gray-100 border border-gray-300">
      {/* 정상 범위 영역 (옅은 회색) */}
      <div
        className="absolute top-0 bottom-0 bg-emerald-100 border-l border-r border-emerald-400"
        style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
      />
      {/* 현재 값 막대 */}
      <div
        className={`absolute top-0 bottom-0 w-[3px] ${barColor}`}
        style={{ left: `calc(${pct}% - 1.5px)` }}
      />
    </div>
  );
}

// 6시간 후 악화 예측 — XGBoost 5-앙상블 결과 시각화
function LabPrognosisChart({
  prognosis,
}: {
  prognosis: {
    hemoglobin_down?: number;
    creatinine_up?: number;
    potassium_worse?: number;
    lactate_up?: number;
    troponin_up?: number;
    warnings?: string[];
    troponin_note?: string | null;
  } | null;
}) {
  if (!prognosis) {
    return (
      <div className="p-6 text-center text-gray-500 italic text-[12px]">
        6시간 예측 결과 없음
      </div>
    );
  }

  const metrics: { key: string; label: string; value: number }[] = [
    { key: "hemoglobin_down", label: PROG_KO.hemoglobin_down, value: prognosis.hemoglobin_down ?? 0 },
    { key: "creatinine_up", label: PROG_KO.creatinine_up, value: prognosis.creatinine_up ?? 0 },
    { key: "potassium_worse", label: PROG_KO.potassium_worse, value: prognosis.potassium_worse ?? 0 },
    { key: "lactate_up", label: PROG_KO.lactate_up, value: prognosis.lactate_up ?? 0 },
    { key: "troponin_up", label: PROG_KO.troponin_up, value: prognosis.troponin_up ?? 0 },
  ];

  // 전반적 위험도 (5개 평균)
  const meanRisk = metrics.reduce((s, m) => s + m.value, 0) / metrics.length;
  const overallTone =
    meanRisk >= 0.6
      ? { ko: "고위험", color: "bg-red-100 border-red-500 text-red-800" }
      : meanRisk >= 0.4
      ? { ko: "중간 위험", color: "bg-amber-100 border-amber-500 text-amber-800" }
      : { ko: "저위험", color: "bg-emerald-100 border-emerald-500 text-emerald-800" };

  return (
    <div className="p-3 space-y-3">
      {/* 헤더 — 종합 위험도 + 경고 */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[12px] font-bold text-gray-800">XGBoost 5-앙상블 6시간 후 악화 예측</span>
        <span className={`px-2 py-0.5 text-[11px] font-bold border-l-4 ${overallTone.color}`}>
          종합 {overallTone.ko} (평균 {(meanRisk * 100).toFixed(0)}%)
        </span>
        {prognosis.warnings && prognosis.warnings.length > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700 border border-red-400">
            <AlertTriangle size={11} />
            경고: {prognosis.warnings.join(", ")}
          </span>
        )}
      </div>

      {/* 산점도 — X: metric index, Y: 위험도 (0~1), 회귀선 */}
      <ScatterChart metrics={metrics} />

      {/* 막대 차트 — 각 metric별 위험도 */}
      <div className="space-y-1.5">
        {metrics.map((m) => {
          const pct = m.value * 100;
          const high = m.value >= 0.5;
          const mid = m.value >= 0.3 && m.value < 0.5;
          const barColor = high ? "bg-red-500" : mid ? "bg-amber-500" : "bg-emerald-500";
          const textColor = high ? "text-red-700" : mid ? "text-amber-700" : "text-emerald-700";
          return (
            <div key={m.key} className="flex items-center gap-2 text-[12px]">
              <span className="w-32 text-gray-800 font-medium shrink-0">{m.label}</span>
              <div className="flex-1 bg-gray-100 border border-gray-300 h-4 relative">
                <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
                {/* 임계선 (50%) */}
                <div className="absolute top-0 bottom-0 w-px bg-gray-700" style={{ left: "50%" }} />
              </div>
              <span className={`w-12 text-right font-mono font-bold ${textColor}`}>
                {pct.toFixed(1)}%
              </span>
              {high && <AlertTriangle size={12} className="text-red-600 shrink-0" />}
            </div>
          );
        })}
      </div>

      {/* Troponin 미측정 경고 */}
      {prognosis.troponin_note && (
        <div className="bg-amber-50 border border-amber-300 px-2 py-1.5 text-[11px] text-amber-800 italic">
          ⓘ {prognosis.troponin_note}
        </div>
      )}
    </div>
  );
}

// 산점도 — X: metric, Y: 위험도, 회귀선
function ScatterChart({
  metrics,
}: {
  metrics: { key: string; label: string; value: number }[];
}) {
  const W = 600;
  const H = 200;
  const padL = 40;
  const padR = 20;
  const padT = 15;
  const padB = 35;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const xStep = plotW / Math.max(metrics.length - 1, 1);

  // 선형회귀: y = mx + b
  const xs = metrics.map((_, i) => i);
  const ys = metrics.map((m) => m.value);
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const sumXX = xs.reduce((a, b) => a + b * b, 0);
  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) || 0;
  const intercept = (sumY - slope * sumX) / n;

  function px(i: number) {
    return padL + i * xStep;
  }
  function py(v: number) {
    return padT + (1 - v) * plotH;
  }

  return (
    <div className="bg-gray-50 border border-gray-300 p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
        {/* Y 축 라벨 */}
        {[0, 0.25, 0.5, 0.75, 1].map((y) => (
          <g key={y}>
            <line
              x1={padL}
              y1={py(y)}
              x2={W - padR}
              y2={py(y)}
              stroke={y === 0.5 ? "#dc2626" : "#e5e7eb"}
              strokeWidth={y === 0.5 ? 1 : 0.5}
              strokeDasharray={y === 0.5 ? "4 3" : ""}
            />
            <text
              x={padL - 6}
              y={py(y) + 4}
              fill="#6b7280"
              fontSize="11"
              textAnchor="end"
              fontFamily="monospace"
            >
              {(y * 100).toFixed(0)}%
            </text>
          </g>
        ))}
        {/* 임계선 라벨 */}
        <text x={W - padR} y={py(0.5) - 4} fill="#dc2626" fontSize="9" textAnchor="end">
          위험 임계 50%
        </text>

        {/* 회귀선 */}
        <line
          x1={px(0)}
          y1={py(intercept)}
          x2={px(metrics.length - 1)}
          y2={py(intercept + slope * (metrics.length - 1))}
          stroke="#1f2937"
          strokeWidth="1.5"
        />

        {/* 데이터 포인트 + X축 라벨 */}
        {metrics.map((m, i) => {
          const x = px(i);
          const y = py(m.value);
          const high = m.value >= 0.5;
          const mid = m.value >= 0.3 && m.value < 0.5;
          const fill = high ? "#dc2626" : mid ? "#d97706" : "#059669";
          return (
            <g key={m.key}>
              <circle cx={x} cy={y} r={6} fill={fill} stroke="#fff" strokeWidth={1.5} />
              <text
                x={x}
                y={y - 10}
                fill={fill}
                fontSize="10"
                textAnchor="middle"
                fontWeight="bold"
                fontFamily="monospace"
              >
                {(m.value * 100).toFixed(0)}%
              </text>
              <text
                x={x}
                y={H - padB + 14}
                fill="#374151"
                fontSize="10"
                textAnchor="middle"
              >
                {m.label.split(" ")[0]}
              </text>
            </g>
          );
        })}

        {/* 회귀식 표기 */}
        <text x={W - padR - 4} y={padT + 12} fill="#374151" fontSize="10" textAnchor="end" fontFamily="monospace">
          y = {slope.toFixed(3)}x + {intercept.toFixed(3)}
        </text>
      </svg>
    </div>
  );
}
