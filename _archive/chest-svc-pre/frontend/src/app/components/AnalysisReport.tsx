import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { AnalysisResult } from '../api';

const DISEASE_KO: Record<string, string> = {
  Cardiomegaly: '심비대',
  Pleural_Effusion: '흉수',
  Edema: '폐부종',
  Pneumothorax: '기흉',
  Atelectasis: '무기폐',
  Enlarged_Cardiomediastinum: '종격동 확장',
  No_Finding: '정상',
};

interface Props {
  result: AnalysisResult;
}

export function AnalysisReport({ result }: Props) {
  const [expanded, setExpanded] = useState(true);

  const raw = result.rawResponse as Record<string, unknown>;
  const meta = raw.metadata as Record<string, unknown>;
  const m = raw.measurements as Record<string, unknown> ?? {};
  const pf = (raw.findings as Array<Record<string, unknown>>) || [];
  const view = (meta.view as string) ?? 'PA';
  const segMs = (meta.segmentation_ms as number) ?? 0;
  const clsMs = (meta.classification_ms as number) ?? 0;
  const logicMs = (meta.clinical_logic_ms as number) ?? 0;
  const totalMs = (meta.total_time_ms as number) ?? 0;
  const findingsText = (raw.findings_text as string) ?? '';
  const impressionText = (raw.impression as string) ?? '';

  const detected = pf.filter(f => f.detected && f.name !== 'No_Finding');
  const notDetected = pf.filter(f => !f.detected && f.name !== 'No_Finding');
  const noFinding = pf.find(f => f.name === 'No_Finding');

  // confidence 내림차순
  detected.sort((a, b) => (b.confidence as number) - (a.confidence as number));

  const ctr = m.ctr as number;
  const lungRatio = m.lung_area_ratio as number;
  const cpLeft = m.left_cp_angle as number;
  const cpRight = m.right_cp_angle as number;
  const cpLeftStatus = m.left_cp_status as string;
  const cpRightStatus = m.right_cp_status as string;
  const tracheaMidline = m.trachea_midline as boolean;
  const tracheaDev = m.trachea_deviation_direction as string | null;

  const riskReasons: string[] = [];
  if (result.riskLevel === 'critical') {
    const ptx = detected.find(f => f.name === 'Pneumothorax');
    if (ptx && (ptx as Record<string, unknown>).alert) riskReasons.push('긴장성 기흉 (Tension PTX) 의심');
    else riskReasons.push('심비대(severe) + 폐부종 동반');
  } else if (result.riskLevel === 'urgent') {
    if (detected.find(f => f.name === 'Pneumothorax')) riskReasons.push('Pneumothorax 탐지');
    const cardio = detected.find(f => f.name === 'Cardiomegaly');
    if (cardio && (cardio.severity === 'severe')) riskReasons.push('Cardiomegaly severe');
    if (detected.find(f => f.name === 'Edema' && (f.severity === 'severe'))) riskReasons.push('Edema severe');
    if (detected.find(f => f.name === 'Pleural_Effusion' && (f.severity === 'severe'))) riskReasons.push('Pleural Effusion severe');
  }

  return (
    <div className="bg-gray-50 border border-gray-300 rounded-lg shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-blue-600" />
          <span className="font-medium text-gray-900">AI 분석 리포트</span>
          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
            {detected.length}개 질환 탐지 / {totalMs}ms
          </span>
        </div>
        {expanded ? <ChevronUp size={20} className="text-gray-600" /> : <ChevronDown size={20} className="text-gray-600" />}
      </button>

      {expanded && (
        <div className="border-t border-gray-300 px-5 py-4 text-sm text-gray-800 space-y-4">

          {/* ── 파이프라인 실행 ── */}
          <section>
            <h3 className="font-bold text-gray-900 mb-2">1. 파이프라인 실행 (3-Stage)</h3>
            <div className="ml-3 space-y-1.5 text-gray-700">
              <div>
                <span className="font-medium text-blue-700">Stage 1 — UNet 세그멘테이션</span>
                <span className="text-gray-400 ml-2">{segMs}ms</span>
              </div>
              <div className="ml-4 space-y-0.5 text-gray-600">
                <div>촬영 방향: <strong className="text-gray-800">{view}</strong> View</div>
                <div>CTR (심흉비): <strong className={ctr > 0.5 ? 'text-red-600' : 'text-green-600'}>{ctr?.toFixed(4)}</strong>
                  {ctr > 0.5 ? ' (>0.50 → 심비대)' : ' (≤0.50 → 정상)'}</div>
                <div>폐면적비: <strong className={lungRatio < 0.85 || lungRatio > 1.15 ? 'text-orange-600' : 'text-green-600'}>{lungRatio?.toFixed(4)}</strong>
                  {lungRatio < 0.85 || lungRatio > 1.15 ? ' (비대칭)' : ' (정상 범위)'}</div>
                <div>CP각 우(R): <strong>{cpLeft?.toFixed(1)}°</strong> ({cpLeftStatus === 'blunted' ? '둔화' : '정상'})
                  {' | '}좌(L): <strong>{cpRight?.toFixed(1)}°</strong> ({cpRightStatus === 'blunted' ? '둔화' : '정상'})</div>
                <div>기관 중심선: {tracheaMidline ? '정중앙' : <strong className="text-red-600">{tracheaDev}측 편위</strong>}</div>
              </div>

              <div className="mt-1.5">
                <span className="font-medium text-green-700">Stage 2 — DenseNet 분류</span>
                <span className="text-gray-400 ml-2">{clsMs}ms</span>
              </div>
              <div className="ml-4 text-gray-600">
                6개 질환 확률 산출 → <strong className="text-gray-800">{detected.length}개 양성</strong> 탐지
              </div>

              <div className="mt-1.5">
                <span className="font-medium text-purple-700">Stage 3 — Clinical Logic 교차검증</span>
                <span className="text-gray-400 ml-2">{logicMs}ms</span>
              </div>
              <div className="ml-4 text-gray-600">
                DenseNet 확률 + UNet 해부학 측정값 교차검증 → severity 판정
              </div>
            </div>
          </section>

          {/* ── MIMIC-style Report ── */}
          {findingsText && (
            <section>
              <h3 className="font-bold text-gray-900 mb-2">2. Radiology Report (MIMIC-style)</h3>
              <div className="ml-3 bg-white rounded p-3 border border-gray-200 space-y-2">
                <div>
                  <span className="text-xs font-medium text-blue-600 uppercase">Findings</span>
                  <p className="text-gray-700 text-sm mt-1">{findingsText}</p>
                </div>
                <div>
                  <span className="text-xs font-medium text-blue-600 uppercase">Impression</span>
                  <pre className="text-gray-700 text-sm mt-1 whitespace-pre-line font-sans">{impressionText}</pre>
                </div>
              </div>
            </section>
          )}

          {/* ── 탐지 소견 ── */}
          <section>
            <h3 className="font-bold text-gray-900 mb-2">
              3. 탐지 소견 ({detected.length > 0 ? `${detected.length}개 질환` : '정상'})
            </h3>
            {detected.length > 0 ? (
              <div className="ml-3 space-y-3">
                {detected.map((f, i) => {
                  const v = f.verification as Record<string, unknown> | null;
                  const evidence = (f.evidence as string[]) || [];
                  const dn = v?.densenet;
                  const unet = v?.unet_confirmed;
                  const crossLabel = dn && unet ? '이중 확인 (DenseNet + UNet)'
                    : dn ? 'DenseNet 단독' : unet ? 'UNet 단독' : '—';
                  const crossColor = dn && unet ? 'text-green-600' : 'text-orange-600';

                  return (
                    <div key={f.name as string} className="bg-white rounded p-3 border border-gray-200">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-gray-400 text-xs">{i + 1}.</span>
                        <strong className="text-gray-900">{f.name as string}</strong>
                        <span className="text-gray-500">({DISEASE_KO[f.name as string] ?? ''})</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded ${
                          f.severity === 'severe' || f.severity === 'critical' ? 'bg-red-100 text-red-700'
                          : f.severity === 'moderate' ? 'bg-orange-100 text-orange-700'
                          : 'bg-yellow-100 text-yellow-700'
                        }`}>{f.severity as string}</span>
                        <span className="text-gray-400 text-xs ml-auto">conf {((f.confidence as number) * 100).toFixed(0)}%</span>
                      </div>
                      <div className="ml-5 space-y-0.5 text-gray-600 text-xs">
                        {evidence.map((e, j) => (
                          <div key={j}>· {e}</div>
                        ))}
                        <div>교차검증: <span className={crossColor}>{crossLabel}</span></div>
                        {f.location && <div>위치: {f.location as string}</div>}
                        {f.recommendation && (
                          <div className="text-blue-700">권장: {f.recommendation as string}</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="ml-3 text-green-700">
                6개 질환 전부 음성 — 정상 소견
                {noFinding && (noFinding.evidence as string[])?.length > 0 && (
                  <div className="text-gray-500 text-xs mt-1">
                    {(noFinding.evidence as string[]).map((e, i) => <div key={i}>· {e}</div>)}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ── 미탐지 소견 ── */}
          {notDetected.length > 0 && (
            <section>
              <h3 className="font-bold text-gray-900 mb-1">4. 미탐지 (음성)</h3>
              <div className="ml-3 text-gray-500 text-xs">
                {notDetected.map(f => (
                  <span key={f.name as string} className="inline-block mr-3">
                    {f.name as string} ({((f.confidence as number) * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* ── 위험도 판정 ── */}
          <section>
            <h3 className="font-bold text-gray-900 mb-1">
              {detected.length > 0 ? '5' : '4'}. 위험도 판정
            </h3>
            <div className="ml-3">
              <span className={`inline-block px-3 py-1 rounded font-bold text-white text-xs ${
                result.riskLevel === 'critical' ? 'bg-red-600'
                : result.riskLevel === 'urgent' ? 'bg-orange-600'
                : 'bg-green-600'
              }`}>{result.riskLevel.toUpperCase()}</span>
              {riskReasons.length > 0 && (
                <span className="text-gray-600 ml-2 text-xs">
                  — {riskReasons.join(', ')}
                </span>
              )}
              {result.riskLevel === 'routine' && (
                <span className="text-gray-600 ml-2 text-xs">— 긴급 소견 없음</span>
              )}
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
