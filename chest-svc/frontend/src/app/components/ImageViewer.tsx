import { useState, useRef, useCallback, useEffect } from 'react';
import { Eye, EyeOff, Ruler } from 'lucide-react';
import type { OverlayCoords } from '../api';

interface ImageViewerProps {
  imageUrl: string;
  segmentationMask?: string;
  riskLevel: 'critical' | 'urgent' | 'routine';
  overlayCoords?: OverlayCoords | null;
  viewType?: 'PA' | 'AP' | 'Lateral';
}

// 색상 — 지시서 스펙
const C = {
  heart: '#FF4444',
  thorax: '#4488FF',
  mediastinum: '#FFD700',
  trachea: '#AA66FF',
  cpNormal: '#44BB44',
  cpAbnormal: '#FF8800',
  diaphragm: '#66CCFF',
  ctrLabel: '#FFFFFF',
};

export function ImageViewer({
  imageUrl, segmentationMask, riskLevel, overlayCoords, viewType = 'PA',
}: ImageViewerProps) {
  const [showSeg, setShowSeg] = useState(true);
  const [showMeas, setShowMeas] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const recalc = useCallback(() => {
    const img = imgRef.current, ctn = containerRef.current;
    if (!img || !ctn || !img.naturalWidth) return;
    const cw = ctn.clientWidth, ch = ctn.clientHeight;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const s = Math.min(cw / iw, ch / ih);
    const rw = iw * s, rh = ih * s;
    setRect({ x: (cw - rw) / 2, y: (ch - rh) / 2, w: rw, h: rh });
  }, []);

  useEffect(() => {
    recalc();
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [imageUrl, recalc]);

  const riskCls = { critical: 'bg-red-600', urgent: 'bg-orange-600', routine: 'bg-green-600' };
  const riskLbl = { critical: 'CRITICAL', urgent: 'URGENT', routine: 'ROUTINE' };
  const oc = overlayCoords;
  const W = oc?.imageSize[1] ?? 0, H = oc?.imageSize[0] ?? 0;

  return (
    <div ref={containerRef} className="relative bg-black rounded-lg overflow-hidden h-full border border-gray-300">
      <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
        <button onClick={() => setShowSeg(!showSeg)}
          className="px-3 py-2 bg-white/90 hover:bg-white text-gray-900 rounded flex items-center gap-2 shadow-md text-sm">
          {showSeg ? <Eye size={16} /> : <EyeOff size={16} />}<span>세그멘테이션</span>
        </button>
        <button onClick={() => setShowMeas(!showMeas)}
          className="px-3 py-2 bg-white/90 hover:bg-white text-gray-900 rounded flex items-center gap-2 shadow-md text-sm">
          {showMeas ? <Ruler size={16} /> : <EyeOff size={16} />}<span>측정선</span>
        </button>
      </div>
      <div className="absolute top-4 left-4 z-10">
        <div className={`${riskCls[riskLevel]} text-white px-4 py-2 rounded font-bold shadow-md`}>{riskLbl[riskLevel]}</div>
      </div>
      <div className="absolute bottom-4 left-4 z-10">
        <div className="bg-white/90 text-gray-900 px-3 py-1 rounded text-sm shadow-md">{viewType} View</div>
      </div>

      <div className="relative w-full h-full flex items-center justify-center">
        <img ref={imgRef} src={imageUrl} alt="Chest X-ray"
          className="max-w-full max-h-full object-contain" onLoad={recalc} />
        {showSeg && segmentationMask && rect && (
          <img src={segmentationMask} alt="Seg" style={{
            position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h,
            opacity: 0.5, mixBlendMode: 'screen', pointerEvents: 'none',
          }} />
        )}
        {showMeas && rect && oc && W > 0 && H > 0 && (
          <svg style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, pointerEvents: 'none' }}
            viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            <Overlay oc={oc} W={W} H={H} />
          </svg>
        )}
      </div>

      {showSeg && (
        <div className="absolute bottom-4 right-4 z-10 bg-white/90 px-3 py-2 rounded shadow-md">
          <div className="flex gap-4 text-xs font-medium text-gray-900">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500/60 inline-block shrink-0" /><span>우폐(R)</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-green-500/60 inline-block shrink-0" /><span>좌폐(L)</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-red-500/60 inline-block shrink-0" /><span>심장</span></span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-yellow-500/60 inline-block shrink-0" /><span>종격동</span></span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Label helper ──
function Lbl({ x, y, text, color, fs }: { x: number; y: number; text: string; color: string; fs: number }) {
  const p = Math.round(fs * 0.3);
  const tw = text.length * fs * 0.52;
  return (
    <>
      <rect x={x - tw / 2 - p} y={y - fs - p} width={tw + p * 2} height={fs + p * 2} rx={p} fill="rgba(0,0,0,0.75)" />
      <text x={x} y={y - p * 0.5} fill={color} fontSize={fs} textAnchor="middle" fontFamily="sans-serif" fontWeight="bold">{text}</text>
    </>
  );
}

// ── CP angle arc helper ──
function CpAngleVis({ px, py, angle, side, color, sw, lineLen }: {
  px: number; py: number; angle: number; side: 'left' | 'right';
  color: string; sw: number; lineLen: number;
}) {
  // 각도를 라디안으로
  const deg2rad = (d: number) => d * Math.PI / 180;

  // viewer 좌측 CP (=환자 우측R): 횡격막 → 오른쪽(0°), 폐벽 → angle° 반시계(위쪽)
  // viewer 우측 CP (=환자 좌측L): 횡격막 → 왼쪽(180°), 폐벽 → (180-angle)° 반시계
  let diaAngle: number, wallAngle: number;
  if (side === 'left') {
    diaAngle = 0;                    // 오른쪽(내측)
    wallAngle = deg2rad(angle);      // 위쪽 방향 (반시계)
  } else {
    diaAngle = Math.PI;              // 왼쪽(내측)
    wallAngle = Math.PI - deg2rad(angle); // 위쪽 방향
  }

  // 벡터 끝점 계산
  const diaEndX = px + Math.cos(diaAngle) * lineLen;
  const diaEndY = py - Math.sin(diaAngle) * lineLen;
  const wallEndX = px + Math.cos(wallAngle) * lineLen;
  const wallEndY = py - Math.sin(wallAngle) * lineLen;

  // 호(arc) 그리기: CP point 중심, 반지름 arcR
  const arcR = lineLen * 0.45;
  const arcStartX = px + Math.cos(diaAngle) * arcR;
  const arcStartY = py - Math.sin(diaAngle) * arcR;
  const arcEndX = px + Math.cos(wallAngle) * arcR;
  const arcEndY = py - Math.sin(wallAngle) * arcR;

  // SVG arc: 각도가 180° 미만이면 small arc (0)
  const largeArc = angle > 180 ? 1 : 0;
  // sweep direction: left는 반시계(0), right는 시계(1)
  const sweep = side === 'left' ? 0 : 1;

  return (
    <g>
      {/* 횡격막 방향선 */}
      <line x1={px} y1={py} x2={diaEndX} y2={diaEndY}
        stroke={color} strokeWidth={sw * 1.5} />
      {/* 폐벽 방향선 */}
      <line x1={px} y1={py} x2={wallEndX} y2={wallEndY}
        stroke={color} strokeWidth={sw * 1.5} />
      {/* CP point */}
      <circle cx={px} cy={py} r={sw * 2} fill={color} opacity={0.9} />
      {/* 각도 호 */}
      <path
        d={`M ${arcStartX} ${arcStartY} A ${arcR} ${arcR} 0 ${largeArc} ${sweep} ${arcEndX} ${arcEndY}`}
        fill="none" stroke={color} strokeWidth={sw} opacity={0.8}
      />
    </g>
  );
}

function Overlay({ oc, W, H }: { oc: OverlayCoords; W: number; H: number }) {
  const sw = Math.max(3, Math.round(W / 250));
  const fs = Math.max(18, Math.round(W / 85));
  const lineLen = Math.round(W * 0.06); // CP angle 벡터선 길이

  return (
    <>
      {/* ━━ 1. 기관 편위선 (보라 #AA66FF) ━━ */}
      {oc.trachea && oc.trachea.thoraxCenterX > 0 && (() => {
        const t = oc.trachea;
        const yS = t.yStart || Math.round(H * 0.10);
        const yE = t.yEnd || Math.round(H * 0.33);
        const col = C.trachea;
        const alert = !t.midline;
        const alertCol = alert ? '#FF4444' : col;
        return (
          <>
            {/* 흉곽 중심 참조선 (연한 보라 실선) */}
            <line x1={t.thoraxCenterX} y1={yS} x2={t.thoraxCenterX} y2={yE}
              stroke={col} strokeWidth={sw * 0.5} opacity={0.3} />
            {/* 기관 중심선 (보라 점선) */}
            <line x1={t.mediastinumCenterX} y1={yS} x2={t.mediastinumCenterX} y2={yE}
              stroke={alertCol} strokeWidth={alert ? sw * 1.5 : sw}
              strokeDasharray={`${sw * 3},${sw * 2}`} />
            <circle cx={t.mediastinumCenterX} cy={yE} r={sw * 1.2} fill={alertCol} />
            {/* 편위 화살표 */}
            {alert && (
              <line x1={t.thoraxCenterX} y1={(yS + yE) / 2} x2={t.mediastinumCenterX} y2={(yS + yE) / 2}
                stroke={alertCol} strokeWidth={sw} markerEnd="url(#arrowRed)" />
            )}
            <Lbl x={t.mediastinumCenterX} y={yS - sw * 2}
              text={t.midline ? '기관 정중' : `기관 편위(${t.deviationDirection ?? '?'})`}
              color={alertCol} fs={fs} />
          </>
        );
      })()}

      {/* ━━ 2. 종격동 폭 (노랑 #FFD700, 점선) ━━ */}
      {oc.mediastinum && oc.mediastinum.widthPx > 0 && (() => {
        const m = oc.mediastinum;
        const endH = sw * 5; // 양 끝 세로선 높이
        return (
          <>
            <line x1={m.xLeft} y1={m.yLevel} x2={m.xRight} y2={m.yLevel}
              stroke={C.mediastinum} strokeWidth={sw} strokeDasharray={`${sw * 3},${sw * 2}`} />
            {/* 양 끝 세로 마커 */}
            <line x1={m.xLeft} y1={m.yLevel - endH / 2} x2={m.xLeft} y2={m.yLevel + endH / 2}
              stroke={C.mediastinum} strokeWidth={sw} />
            <line x1={m.xRight} y1={m.yLevel - endH / 2} x2={m.xRight} y2={m.yLevel + endH / 2}
              stroke={C.mediastinum} strokeWidth={sw} />
            <Lbl x={(m.xLeft + m.xRight) / 2} y={m.yLevel - sw * 2}
              text={`종격동 ${m.widthPx}px`} color={C.mediastinum} fs={fs} />
          </>
        );
      })()}

      {/* ━━ 3. CTR (심장폭 빨강 실선 + 흉곽폭 파랑 점선) ━━ */}
      {oc.ctrLines && oc.heartWidthPx > 0 && oc.thoraxWidthPx > 0 && (() => {
        const c = oc.ctrLines;
        const ctrVal = (oc.heartWidthPx / oc.thoraxWidthPx).toFixed(2);
        const hMid = (c.heartLeftX + c.heartRightX) / 2;
        const tMid = (c.thoraxLeftX + c.thoraxRightX) / 2;
        return (
          <>
            {/* 심장폭 (빨강 실선 2px) */}
            <line x1={c.heartLeftX} y1={c.heartRow} x2={c.heartRightX} y2={c.heartRow}
              stroke={C.heart} strokeWidth={sw * 1.5} />
            <circle cx={c.heartLeftX} cy={c.heartRow} r={sw * 1.5} fill={C.heart} />
            <circle cx={c.heartRightX} cy={c.heartRow} r={sw * 1.5} fill={C.heart} />
            <Lbl x={hMid} y={c.heartRow - sw * 2} text={`심장 ${oc.heartWidthPx}px`} color={C.heart} fs={fs} />

            {/* 흉곽폭 (파랑 점선 2px) */}
            <line x1={c.thoraxLeftX} y1={c.thoraxRow} x2={c.thoraxRightX} y2={c.thoraxRow}
              stroke={C.thorax} strokeWidth={sw} strokeDasharray={`${sw * 4},${sw * 2}`} />
            <circle cx={c.thoraxLeftX} cy={c.thoraxRow} r={sw * 1.2} fill={C.thorax} />
            <circle cx={c.thoraxRightX} cy={c.thoraxRow} r={sw * 1.2} fill={C.thorax} />
            <Lbl x={tMid} y={c.thoraxRow + fs + sw * 4} text={`흉곽 ${oc.thoraxWidthPx}px`} color={C.thorax} fs={fs} />

            {/* 수직 연결선 */}
            <line x1={c.heartLeftX} y1={c.heartRow} x2={c.heartLeftX} y2={c.thoraxRow}
              stroke={C.heart} strokeWidth={sw * 0.4} strokeDasharray={`${sw * 2},${sw * 2}`} opacity={0.3} />
            <line x1={c.heartRightX} y1={c.heartRow} x2={c.heartRightX} y2={c.thoraxRow}
              stroke={C.heart} strokeWidth={sw * 0.4} strokeDasharray={`${sw * 2},${sw * 2}`} opacity={0.3} />

            {/* CTR 값 (흰색) */}
            <Lbl x={hMid} y={(c.heartRow + c.thoraxRow) / 2 + fs * 0.4}
              text={`CTR = ${ctrVal}`} color={C.ctrLabel} fs={Math.round(fs * 1.15)} />
          </>
        );
      })()}

      {/* ━━ 4. CP angle (벡터선 + 호 + 각도) ━━ */}
      {(['left', 'right'] as const).map(side => {
        const cp = oc.cpAngle[side];
        if (!cp) return null;
        const col = cp.status === 'blunted' ? C.cpAbnormal : C.cpNormal;
        const stxt = cp.status === 'blunted' ? '둔화' : '정상';
        const sko = side === 'right' ? '우' : '좌';
        return (
          <g key={side}>
            <CpAngleVis
              px={cp.point[0]} py={cp.point[1]}
              angle={cp.angle} side={side}
              color={col} sw={sw} lineLen={lineLen}
            />
            <Lbl x={cp.point[0]} y={cp.point[1] - lineLen - sw * 2}
              text={`${sko} CP ${cp.angle.toFixed(1)}°(${stxt})`} color={col} fs={fs} />
          </g>
        );
      })}

      {/* ━━ 5. 횡격막 돔 (하늘 #66CCFF, 삼각형) ━━ */}
      {oc.diaphragm.status !== 'unmeasurable' && (() => {
        const rp = oc.diaphragm.right, lp = oc.diaphragm.left;
        const ts = sw * 2.5;
        const elevated = oc.diaphragm.status.startsWith('elevated');
        return (
          <>
            {rp && rp[0] > 0 && (
              <>
                <polygon points={`${rp[0]},${rp[1] - ts} ${rp[0] - ts * 0.7},${rp[1] + ts * 0.4} ${rp[0] + ts * 0.7},${rp[1] + ts * 0.4}`} fill={C.diaphragm} />
                <Lbl x={rp[0]} y={rp[1] + ts * 2.5 + fs} text="좌(L) 횡격막" color={C.diaphragm} fs={fs} />
              </>
            )}
            {lp && lp[0] > 0 && (
              <>
                <polygon points={`${lp[0]},${lp[1] - ts} ${lp[0] - ts * 0.7},${lp[1] + ts * 0.4} ${lp[0] + ts * 0.7},${lp[1] + ts * 0.4}`} fill={C.diaphragm} />
                <Lbl x={lp[0]} y={lp[1] + ts * 2.5 + fs} text="우(R) 횡격막" color={C.diaphragm} fs={fs} />
              </>
            )}
            {/* 좌우 연결 점선 */}
            {rp && lp && rp[0] > 0 && lp[0] > 0 && (
              <line x1={rp[0]} y1={rp[1]} x2={lp[0]} y2={lp[1]}
                stroke={C.diaphragm} strokeWidth={sw * 0.8} strokeDasharray={`${sw * 3},${sw * 2}`} opacity={0.5} />
            )}
            {/* 높이차 표시 */}
            {elevated && rp && lp && rp[0] > 0 && lp[0] > 0 && Math.abs(rp[1] - lp[1]) > 5 && (() => {
              const higher = rp[1] < lp[1] ? rp : lp;
              const lower = rp[1] < lp[1] ? lp : rp;
              const midX = (higher[0] + lower[0]) / 2;
              const diff = Math.abs(rp[1] - lp[1]);
              return (
                <>
                  <line x1={midX} y1={higher[1]} x2={midX} y2={lower[1]}
                    stroke={C.diaphragm} strokeWidth={sw} />
                  <line x1={midX - sw * 3} y1={higher[1]} x2={midX + sw * 3} y2={higher[1]}
                    stroke={C.diaphragm} strokeWidth={sw} />
                  <line x1={midX - sw * 3} y1={lower[1]} x2={midX + sw * 3} y2={lower[1]}
                    stroke={C.diaphragm} strokeWidth={sw} />
                  <Lbl x={midX + W * 0.04} y={(higher[1] + lower[1]) / 2 + fs * 0.3}
                    text={`${diff}px차`} color={C.diaphragm} fs={Math.round(fs * 0.85)} />
                </>
              );
            })()}
          </>
        );
      })()}
    </>
  );
}
