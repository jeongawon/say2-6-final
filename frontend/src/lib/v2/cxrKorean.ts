// CXR 모달 결과(chest-svc 영어 출력)를 구조화 소견 기반으로 한국어로 재구성.
// PatientResultsPage / ReportEditorPage 공용.

const CXR_NAME_KO: Record<string, string> = {
  Cardiomegaly: "심비대", Pleural_Effusion: "흉막삼출", Edema: "폐부종",
  Pneumothorax: "기흉", Atelectasis: "무기폐", Enlarged_Cardiomediastinum: "종격동 비대",
  Consolidation: "폐 경화", Pneumonia: "폐렴", Lung_Opacity: "폐 음영",
  Fracture: "골절", Support_Devices: "의료기기 삽입", No_Finding: "특이 소견 없음",
};
const CXR_SEV_KO: Record<string, string> = { mild: "경도", moderate: "중등도", severe: "중증" };
const CXR_DIFF_KO: Record<string, string> = { Atelectasis: "폐렴 감별 필요", Pleural_Effusion: "혈흉 감별 필요" };
const CXR_REC_KO: Record<string, string> = {
  "Echocardiography recommended": "심초음파 권장",
  "Clinical correlation with BNP recommended": "BNP 등 임상 연관성 확인 권장",
  "Clinical correlation recommended": "임상 연관성 확인 권장",
};

/** CXR 결과 → 한국어 소견 문자열. 이미 한국어 summary가 있으면 그대로 사용. */
export function cxrKoreanSummary(result: Record<string, unknown> | null | undefined): string {
  if (!result) return "";
  const summary = String((result as { summary?: string }).summary ?? "");
  if (/[가-힣]/.test(summary)) return summary; // chest-svc가 한국어를 주면 그대로
  const findings = (result.findings as Array<Record<string, unknown>>) || [];
  const ctr = (result.measurements as { ctr?: number } | undefined)?.ctr;
  const lines: string[] = [];
  let n = 1;
  for (const f of findings) {
    if (f.name === "No_Finding" || !f.detected) continue;
    const ko = CXR_NAME_KO[String(f.name)] || String(f.name);
    const sev = CXR_SEV_KO[String(f.severity)] || "";
    const loc = f.location === "right" ? "우측 " : f.location === "left" ? "좌측 " : "";
    let line = `${n}. ${sev ? sev + " " : ""}${loc}${ko}`;
    if (f.name === "Cardiomegaly" && typeof ctr === "number") line += ` (CTR ${ctr.toFixed(2)})`;
    if (CXR_DIFF_KO[String(f.name)]) line += ` (${CXR_DIFF_KO[String(f.name)]})`;
    const rec = CXR_REC_KO[String(f.recommendation)];
    if (rec) line += ` — ${rec}`;
    lines.push(line);
    n++;
  }
  for (const f of findings) {
    if (f.detected || f.name === "No_Finding") continue;
    if (f.name === "Pneumothorax" || f.name === "Enlarged_Cardiomediastinum") {
      lines.push(`${n}. ${CXR_NAME_KO[String(f.name)] || String(f.name)} 없음`);
      n++;
    }
  }
  return lines.join("\n") || summary;
}
