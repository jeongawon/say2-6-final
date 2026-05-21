import type { KTAS, Sex, PastHistoryCode } from "../../types/triage";

/* ─────────────────────────────────────────────────────────
   한국어 음성 받아쓰기 → 트리아지 폼 필드 파서
   예) "55세 남자 등록번호 12345678 혈압 140에 90 맥박 100
        산소포화도 95 체온 38.2 통증 7 케이타스 2 주호소는 흉통
        고혈압 당뇨 있음"
   브라우저 STT는 숫자를 보통 아라비아 숫자로 반환 → 숫자 기반 파싱.
   ───────────────────────────────────────────────────────── */

export interface ParsedTriage {
  subjectId?: string;
  name?: string;
  age?: number;
  sex?: Sex;
  hr?: number;
  sbp?: number;
  dbp?: number;
  rr?: number;
  spo2?: number;
  bt?: number;
  pain?: number;
  chief?: string;
  ktas?: KTAS;
  pastHx?: PastHistoryCode[];
}

/* 흔한 의료 용어 오인식 교정 — Web Speech는 커스텀 어휘를 못 넣으므로 후처리로 보정 */
const TERM_FIXES: [RegExp, string][] = [
  [/케이\s*타스|케이\s*태스|케이티에이에스/gi, "KTAS"],
  [/산소\s*포\s*화\s*도|산소\s*포화/g, "산소포화도"],
  [/에스피\s*오\s*투/gi, "SpO2"],
  [/심\s*박\s*수/g, "심박수"],
  [/호\s*흡\s*수/g, "호흡수"],
  [/흥통/g, "흉통"],          // 흉통 오인식
  [/흉\s*통/g, "흉통"],
  [/호흡\s*곤란/g, "호흡곤란"],
];

function fixMedicalTerms(t: string): string {
  let s = t;
  for (const [re, rep] of TERM_FIXES) s = s.replace(re, rep);
  return s;
}

/* 주호소 키워드 사전 — "주호소" 라고 말하지 않아도 증상어가 있으면 자동 인식 */
const SYMPTOMS: [RegExp, string][] = [
  [/흉통|가슴\s*(?:이\s*)?(?:아프|통증|답답|조이)/, "흉통"],
  [/호흡곤란|숨\s*(?:이\s*)?(?:차|막|가쁘)/, "호흡곤란"],
  [/복통|배\s*(?:가\s*)?(?:아프|통증)/, "복통"],
  [/두통|머리\s*(?:가\s*)?아프/, "두통"],
  [/어지(?:러움|럽|러)|현기증|어찔/, "어지러움"],
  [/실신|기절|의식\s*소실/, "실신"],
  [/발열|고열|열\s*(?:이\s*)?나/, "발열"],
  [/구토|토(?:함|했)|오심|메스꺼|울렁/, "오심·구토"],
  [/요통|허리\s*(?:가\s*)?아프/, "요통"],
  [/마비|편마비|힘\s*(?:이\s*)?빠/, "위약·마비"],
  [/경련|발작/, "경련"],
];

const PAST_HX_PATTERNS: [RegExp, PastHistoryCode][] = [
  [/고혈압|혈압\s*약/, "HTN"],
  [/당뇨/, "DM"],
  [/관상동맥|협심증|심근경색|스텐트/, "CAD"],
  [/뇌졸중|뇌경색|뇌출혈|중풍/, "CVA"],
  [/만성\s*폐쇄성|COPD|폐기종/i, "COPD"],
  [/천식/, "ASTHMA"],
  [/만성\s*신부전|신부전|투석|콩팥/, "CKD"],
  [/심방\s*세동|부정맥|에이\s*피브|에이파이브/i, "AFIB"],
];

function pickInt(text: string, re: RegExp): number | undefined {
  const m = text.match(re);
  return m ? parseInt(m[1], 10) : undefined;
}

export function parseTriageSpeech(raw: string): ParsedTriage {
  const text = fixMedicalTerms(raw.replace(/\s+/g, " ").trim());
  const out: ParsedTriage = {};

  // 나이 — "55세", "나이 55"
  out.age = pickInt(text, /(\d{1,3})\s*세/) ?? pickInt(text, /나이[는은]?\s*(\d{1,3})/);

  // 성별
  if (/남자|남성|남환|\bm\b/i.test(text) || /\b남\b/.test(text)) out.sex = "M";
  else if (/여자|여성|여환|\bf\b/i.test(text) || /\b여\b/.test(text)) out.sex = "F";

  // 등록번호 (MRN) — 숫자 4자리 이상
  const mrn = text.match(/등록\s*번호[는은]?\s*(\d{4,})/);
  if (mrn) out.subjectId = mrn[1];

  // 환자명 — "이름 김OO", "환자명 홍길동", "성함 ..."
  const nm = text.match(/(?:환자\s*명|이름|성함)[은는]?\s*([가-힣]{2,4})/);
  if (nm) out.name = nm[1];

  // 혈압 — "혈압 140에 90", "혈압 140 90", "140/80"
  const bp =
    text.match(/혈압[은는]?\s*(\d{2,3})\s*(?:에|\/|,|\s)\s*(\d{2,3})/) ??
    text.match(/(\d{2,3})\s*\/\s*(\d{2,3})/);
  if (bp) {
    out.sbp = parseInt(bp[1], 10);
    out.dbp = parseInt(bp[2], 10);
  }
  // 수축기/이완기를 따로 말한 경우
  if (out.sbp === undefined) out.sbp = pickInt(text, /수축기[^0-9]{0,4}(\d{2,3})/);
  if (out.dbp === undefined) out.dbp = pickInt(text, /이완기[^0-9]{0,4}(\d{2,3})/);

  // 심박수 / 맥박
  out.hr = pickInt(text, /(?:맥박|심박수|심박|에이치\s*알|HR)[은는]?\s*(\d{2,3})/i);

  // 호흡수
  out.rr = pickInt(text, /(?:호흡수|호흡|RR|알\s*알)[은는]?\s*(\d{1,2})/i);

  // 산소포화도
  out.spo2 = pickInt(text, /(?:산소\s*포화도|포화도|산소|에스피오\s*투|SpO2)[은는]?\s*(\d{2,3})/i);

  // 체온 — "체온 38.2", "열 37.5"
  const bt = text.match(/(?:체온|열)[은는]?\s*(\d{2}(?:\.\d)?)/);
  if (bt) out.bt = parseFloat(bt[1]);

  // 통증 점수 0~10
  const pain = pickInt(text, /(?:통증\s*점수|통증|페인)[은는]?\s*(\d{1,2})/i);
  if (pain !== undefined && pain >= 0 && pain <= 10) out.pain = pain;

  // KTAS 1~5
  const k = pickInt(text, /(?:KTAS|케이\s*타스|중증도)[은는]?\s*(\d)/i);
  if (k !== undefined && k >= 1 && k <= 5) out.ktas = k as KTAS;

  // 주호소 — "주호소는 흉통", "주호소 흉통이에요" → 뒤쪽 자유 텍스트
  const cc = text.match(/주\s*호소[는은]?\s*(.+?)(?:\.|$)/);
  if (cc) {
    out.chief = cc[1]
      .replace(/\b(?:KTAS|중증도)\b.*$/i, "")
      .trim();
    if (!out.chief) delete out.chief;
  }
  // "주호소"를 안 말했어도 증상 키워드가 있으면 표준 용어로 채움
  if (!out.chief) {
    const sym = SYMPTOMS.find(([re]) => re.test(text));
    if (sym) out.chief = sym[1];
  }

  // 과거력 (중복 제거)
  const hx = PAST_HX_PATTERNS.filter(([re]) => re.test(text)).map(([, code]) => code);
  if (hx.length) out.pastHx = Array.from(new Set(hx));

  return out;
}
