/**
 * chest-svc-v2 API client — POST /predict 호출 + 응답 변환.
 */

// ── API 요청/응답 타입 ──────────────────────────────────────────

interface PredictFinding {
  name: string;
  detected: boolean;
  confidence: number;
  detail: string;
  severity: string | null;
  location: string | null;
  recommendation: string | null;
}

interface PipelineFinding {
  name: string;
  detected: boolean;
  confidence: number;
  severity: string | null;
  verification: {
    densenet: boolean;
    unet_metric: string | null;
    unet_value: number | string | Record<string, number | null> | null;
    unet_threshold: number | string | null;
    unet_confirmed: boolean;
  } | null;
  evidence: string[];
  location: string | null;
  recommendation: string | null;
}

interface PredictResponse {
  status: string;
  modal: string;
  findings: (PredictFinding & {
    verification?: PipelineFinding['verification'];
    evidence?: string[];
    impression_text?: string;
  })[];
  summary: string;
  risk_level: string;
  findings_text: string;
  impression: string;
  measurements: Record<string, unknown>;
  rag_query_hints: string[];
  metadata: {
    view: string;
    total_time_ms: number;
    original_size: [number, number] | null; // [H, W]
    mask_base64: string | null;
    [key: string]: unknown;
  };
}

// ── UI 컴포넌트용 타입 ──────────────────────────────────────────

export interface DiseaseUI {
  id: string;
  nameEn: string;
  nameKo: string;
  detected: boolean;
  confidence: number;
  severity?: 'mild' | 'moderate' | 'severe' | 'critical';
  verification: {
    densenet: boolean;
    unet: boolean;
    densenetScore?: number;
    unetMetric?: string;
    unetValue?: number;
    unetThreshold?: number;
  };
  evidence: string[];
  recommendation?: string;
  location?: string;
}

export interface PipelineInfo {
  view: string;
  ctr: number;
  ctrStatus: string;
  lungRatio: number;
  cpLeft: number;
  cpLeftStatus: string;
  cpRight: number;
  cpRightStatus: string;
  tracheaMidline: boolean;
  tracheaDev: string | null;
  segMs: number;
  clsMs: number;
  logicMs: number;
  totalMs: number;
  detectedCount: number;
  riskLevel: string;
  riskReasons: string[];
}

export interface MeasurementsUI {
  ctr: { value: number; status: 'normal' | 'abnormal'; threshold: number };
  cpAngleLeft: { value: number; status: 'normal' | 'abnormal'; threshold: number };
  cpAngleRight: { value: number; status: 'normal' | 'abnormal'; threshold: number };
  lungAreaRatio: { value: number; status: 'normal' | 'abnormal' };
  mediastinum: { status: 'normal' | 'abnormal'; description: string };
  trachea: { status: 'normal' | 'abnormal'; description: string };
  diaphragm: { status: 'normal' | 'abnormal'; description: string };
}

/** SVG 오버레이용 픽셀 좌표 (원본 이미지 스케일) */
export interface OverlayCoords {
  imageSize: [number, number]; // [H, W]
  ctrLines: {
    heartLeftX: number;
    heartRightX: number;
    heartRow: number;
    thoraxLeftX: number;
    thoraxRightX: number;
    thoraxRow: number;
  } | null;
  cpAngle: {
    left: { point: [number, number]; angle: number; status: string } | null;
    right: { point: [number, number]; angle: number; status: string } | null;
  };
  diaphragm: {
    left: [number, number] | null;
    right: [number, number] | null;
    status: string;
  };
  mediastinum: {
    xLeft: number; xRight: number; yLevel: number; widthPx: number; status: string;
  } | null;
  trachea: {
    thoraxCenterX: number; mediastinumCenterX: number;
    midline: boolean; deviationDirection: string | null;
    yStart: number; yEnd: number;
  } | null;
  heartWidthPx: number;
  thoraxWidthPx: number;
}

export interface AnalysisResult {
  riskLevel: 'critical' | 'urgent' | 'routine';
  summary: string;
  findingsText: string;
  impression: string;
  processingTime: number;
  diseases: DiseaseUI[];
  measurements: MeasurementsUI;
  pipelineInfo: PipelineInfo;
  segmentationMask: string | null;
  overlayCoords: OverlayCoords | null;
  viewType: 'PA' | 'AP' | 'Lateral';
  rawRequest: Record<string, unknown>;
  rawResponse: PredictResponse;
}

// ── 질환 이름 매핑 ──────────────────────────────────────────────

const DISEASE_MAP: Record<string, { nameEn: string; nameKo: string }> = {
  Cardiomegaly: { nameEn: 'Cardiomegaly', nameKo: '심비대' },
  Pleural_Effusion: { nameEn: 'Pleural Effusion', nameKo: '흉수' },
  Edema: { nameEn: 'Edema', nameKo: '폐부종' },
  Pneumothorax: { nameEn: 'Pneumothorax', nameKo: '기흉' },
  Atelectasis: { nameEn: 'Atelectasis', nameKo: '무기폐' },
  Enlarged_Cardiomediastinum: { nameEn: 'Enlarged Cardiomediastinum', nameKo: '종격동 확장' },
};

// ── API 호출 ────────────────────────────────────────────────────

export async function analyzeChestXray(imageBase64: string): Promise<AnalysisResult> {
  const rawBase64 = imageBase64.includes(',')
    ? imageBase64.split(',')[1]
    : imageBase64;

  const requestPayload = {
    patient_id: 'WEB-' + Date.now(),
    patient_info: {
      age: 50,
      sex: 'M',
      chief_complaint: '흉부 X-Ray 판독',
      history: [],
    },
    data: { image_base64: rawBase64 },
    context: {},
  };

  const resp = await fetch('/predict', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestPayload),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`HTTP ${resp.status}: ${(err as Record<string, string>).detail || resp.statusText}`);
  }

  const data: PredictResponse = await resp.json();
  return transformResponse(data, requestPayload);
}

// ── 응답 변환 ───────────────────────────────────────────────────

function isValidPoint(p: [number, number] | null | undefined): boolean {
  return Array.isArray(p) && p.length === 2 && (p[0] !== 0 || p[1] !== 0);
}

function transformResponse(
  data: PredictResponse,
  requestPayload: Record<string, unknown>,
): AnalysisResult {
  const m = data.measurements as Record<string, unknown>;
  const pipelineFindings = data.findings || [];

  // 6개 질환 매핑 (No_Finding 제외)
  const diseases: DiseaseUI[] = Object.entries(DISEASE_MAP).map(([key, names]) => {
    const pf = pipelineFindings.find((f) => f.name === key);
    const finding = data.findings.find((f) => f.name === key);

    const confidence = pf?.confidence ?? finding?.confidence ?? 0;
    const detected = pf?.detected ?? finding?.detected ?? false;
    const severity = (pf?.severity ?? finding?.severity ?? undefined) as DiseaseUI['severity'];

    const v = pf?.verification;
    let unetValue: number | undefined;
    if (v?.unet_value != null) {
      if (typeof v.unet_value === 'number') {
        unetValue = v.unet_value;
      } else if (typeof v.unet_value === 'object') {
        const vals = Object.values(v.unet_value).filter((x): x is number => x != null);
        unetValue = vals.length > 0 ? Math.min(...vals) : undefined;
      }
    }

    return {
      id: key.toLowerCase().replace(/_/g, '-'),
      ...names,
      detected,
      confidence,
      severity,
      verification: {
        densenet: v?.densenet ?? false,
        unet: v?.unet_confirmed ?? false,
        densenetScore: confidence,
        unetMetric: v?.unet_metric ?? undefined,
        unetValue,
        unetThreshold: typeof v?.unet_threshold === 'number' ? v.unet_threshold : undefined,
      },
      evidence: (pf?.evidence as string[]) ?? [],
      recommendation: (pf?.recommendation as string) ?? undefined,
      location: (pf?.location as string) ?? undefined,
    };
  });

  // detected 우선 + confidence 내림차순 정렬
  diseases.sort((a, b) => {
    if (a.detected !== b.detected) return a.detected ? -1 : 1;
    return b.confidence - a.confidence;
  });

  // measurements 변환
  const ctrVal = (m.ctr as number) ?? 0;
  const cpLeft = (m.left_cp_angle as number) ?? 90;
  const cpRight = (m.right_cp_angle as number) ?? 90;
  const lungRatio = (m.lung_area_ratio as number) ?? 1.0;

  const measurements: MeasurementsUI = {
    ctr: {
      value: ctrVal,
      status: ctrVal > 0.5 ? 'abnormal' : 'normal',
      threshold: 0.5,
    },
    cpAngleLeft: {
      value: cpLeft,
      status: m.left_cp_status === 'blunted' ? 'abnormal' : 'normal',
      threshold: 30,
    },
    cpAngleRight: {
      value: cpRight,
      status: m.right_cp_status === 'blunted' ? 'abnormal' : 'normal',
      threshold: 30,
    },
    lungAreaRatio: {
      value: lungRatio,
      status: lungRatio < 0.85 || lungRatio > 1.18 ? 'abnormal' : 'normal',
    },
    mediastinum: {
      status: m.mediastinum_status === 'widened' ? 'abnormal' : 'normal',
      description: (m.mediastinum_status as string) ?? 'normal',
    },
    trachea: {
      status: m.trachea_midline === false ? 'abnormal' : 'normal',
      description: m.trachea_midline === false
        ? `${(m.trachea_deviation_direction as string) ?? ''}측 편위`
        : '정중선',
    },
    diaphragm: {
      status: m.diaphragm_status === 'abnormal' ? 'abnormal' : 'normal',
      description: (m.diaphragm_status as string) ?? 'normal',
    },
  };

  // segmentation mask
  const maskBase64 = (data.metadata.mask_base64 as string)
    ? `data:image/png;base64,${data.metadata.mask_base64}`
    : null;

  // SVG 오버레이용 픽셀 좌표
  let overlayCoords: OverlayCoords | null = null;
  const origSize = data.metadata.original_size;
  if (origSize) {
    const ctrL = m.ctr_lines as Record<string, number> | null;
    const cpC = m.cp_angle_coords as Record<string, [number, number] | null> | null;
    const diaC = m.diaphragm_coords as Record<string, [number, number] | null> | null;
    const medC = m.mediastinum_coords as Record<string, number> | null;
    const traC = m.trachea_coords as Record<string, unknown> | null;

    const buildCpSide = (pt: [number, number] | null | undefined, angle: number, status: string) => {
      if (!isValidPoint(pt)) return null;
      return { point: pt!, angle, status };
    };

    overlayCoords = {
      imageSize: origSize,
      ctrLines: ctrL
        ? {
            heartLeftX: ctrL.heart_left_x,
            heartRightX: ctrL.heart_right_x,
            heartRow: ctrL.heart_row,
            thoraxLeftX: ctrL.thorax_left_x,
            thoraxRightX: ctrL.thorax_right_x,
            thoraxRow: ctrL.thorax_row,
          }
        : null,
      cpAngle: {
        left: buildCpSide(cpC?.left, cpLeft, m.left_cp_status === 'blunted' ? 'blunted' : 'normal'),
        right: buildCpSide(cpC?.right, cpRight, m.right_cp_status === 'blunted' ? 'blunted' : 'normal'),
      },
      diaphragm: {
        left: isValidPoint(diaC?.left) ? diaC!.left : null,
        right: isValidPoint(diaC?.right) ? diaC!.right : null,
        status: (m.diaphragm_status as string) ?? 'normal',
      },
      mediastinum: medC && medC.x_left > 0
        ? { xLeft: medC.x_left, xRight: medC.x_right, yLevel: medC.y_level,
            widthPx: medC.x_right - medC.x_left, status: (m.mediastinum_status as string) ?? '' }
        : null,
      trachea: traC && (traC.thorax_center_x as number) > 0
        ? {
            thoraxCenterX: traC.thorax_center_x as number,
            mediastinumCenterX: traC.mediastinum_center_x as number,
            midline: traC.midline as boolean,
            deviationDirection: traC.deviation_direction as string | null,
            yStart: traC.y_start as number,
            yEnd: traC.y_end as number,
          }
        : null,
      heartWidthPx: (m.heart_width_px as number) ?? 0,
      thoraxWidthPx: (m.thorax_width_px as number) ?? 0,
    };
  }

  // pipelineInfo
  const detectedCount = diseases.filter(d => d.detected).length;
  const rl = data.risk_level;
  const riskReasons: string[] = [];
  if (rl === 'critical' || rl === 'urgent') {
    if (diseases.find(d => d.detected && d.id === 'pneumothorax')) riskReasons.push('Pneumothorax');
    const cardio = diseases.find(d => d.detected && d.id === 'cardiomegaly');
    if (cardio?.severity === 'severe') riskReasons.push('Cardiomegaly severe');
    if (diseases.find(d => d.detected && d.id === 'edema' && d.severity === 'severe')) riskReasons.push('Edema severe');
    if (diseases.find(d => d.detected && d.id === 'pleural-effusion' && d.severity === 'severe')) riskReasons.push('Pleural Effusion severe');
  }

  const meta = data.metadata as Record<string, unknown>;
  const pipelineInfo: PipelineInfo = {
    view: (meta.view as string) || 'PA',
    ctr: ctrVal,
    ctrStatus: ctrVal > 0.5 ? '심비대' : '정상',
    lungRatio,
    cpLeft, cpLeftStatus: m.left_cp_status === 'blunted' ? '둔화' : '정상',
    cpRight, cpRightStatus: m.right_cp_status === 'blunted' ? '둔화' : '정상',
    tracheaMidline: m.trachea_midline as boolean ?? true,
    tracheaDev: (m.trachea_deviation_direction as string) ?? null,
    segMs: (meta.segmentation_ms as number) ?? 0,
    clsMs: (meta.classification_ms as number) ?? 0,
    logicMs: (meta.clinical_logic_ms as number) ?? 0,
    totalMs: data.metadata.total_time_ms,
    detectedCount,
    riskLevel: rl,
    riskReasons,
  };

  return {
    riskLevel: data.risk_level as AnalysisResult['riskLevel'],
    summary: data.summary,
    findingsText: data.findings_text || '',
    impression: data.impression || '',
    processingTime: data.metadata.total_time_ms as number,
    diseases,
    measurements,
    pipelineInfo,
    segmentationMask: maskBase64,
    overlayCoords,
    viewType: (data.metadata.view as AnalysisResult['viewType']) || 'PA',
    rawRequest: requestPayload,
    rawResponse: data,
  };
}
