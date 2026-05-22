"""Fusion Decision Engine - Hard-coded clinical decision logic."""
import logging

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class FusionDecisionEngine:
    """
    Hard-coded decision logic for multimodal fusion.
    
    Decision flow:
    1. Check if initial modalities are sufficient
    2. Analyze findings for high-risk patterns
    3. Determine if additional modalities needed
    4. Decide if LLM reasoning required
    5. Determine if ready for report generation
    """
    
    # Chief complaint to initial modality mapping
    # 매칭은 chief_complaint.lower()에 key가 substring으로 포함되면 적용.
    # 우선순위: 더 구체적 키워드를 먼저 두면 substring 매치가 먼저 잡힘.
    CHIEF_COMPLAINT_MODALITY_MAP = {
        # 부정맥 계열 — ECG 단독 또는 우선
        'a-fib': ['ECG'],
        'a fib': ['ECG'],
        'atrial fibrillation': ['ECG'],
        'arrhythmia': ['ECG'],
        'palpitation': ['ECG'],            # palpitations / palpitation 모두 매치
        # 흉통/호흡곤란 — 임상적 우선순위: ECG로 STEMI/부정맥 빠르게 배제 → 결과 따라 CXR 2차
        'chest pain': ['ECG', 'CXR'],
        'shortness of breath': ['ECG', 'CXR'],
        'dyspnea': ['ECG', 'CXR'],
        # 신장/대사 — Lab 우선
        'hematuria': ['LAB', 'ECG'],       # 혈뇨 → 신부전 평가 + 부수적 ECG
        'oliguria': ['LAB', 'ECG'],
        'edema': ['LAB', 'CXR'],
        # 일반 응급
        'abdominal pain': ['LAB', 'CXR'],
        'fever': ['LAB', 'CXR'],
        'trauma': ['CXR', 'LAB'],
        'altered mental status': ['LAB', 'ECG'],
        'syncope': ['ECG', 'LAB'],
        'headache': ['LAB'],
        'weakness': ['LAB', 'ECG'],
    }
    
    # High-risk finding combinations requiring reasoning
    HIGH_RISK_PATTERNS = [
        {'CXR': ['pneumonia', 'infiltrate', 'consolidation'], 'LAB': ['elevated wbc', 'leukocytosis']},
        {'CXR': ['cardiomegaly', 'pulmonary edema'], 'ECG': ['st elevation', 'st depression']},
        {'ECG': ['st elevation', 'stemi'], 'LAB': ['elevated troponin']},
        {'CXR': ['pneumothorax'], 'ECG': ['arrhythmia']},
    ]
    
    # Confidence thresholds
    HIGH_CONFIDENCE = 0.85
    LOW_CONFIDENCE = 0.60
    MAX_ITERATIONS = 3
    
    def __init__(self, patient, modalities_completed, inference_results, iteration=1):
        self.patient = patient
        self.modalities_completed = modalities_completed
        self.inference_results = inference_results
        self.iteration = iteration
        # 프론트는 'chest_pain'/'shortness_of_breath' 같은 코드형 슬러그를 보내고
        # 매핑 테이블 키는 'chest pain'/'shortness of breath' 형태이므로
        # 언더스코어를 공백으로 정규화한다.
        self.chief_complaint = patient.get('chief_complaint', '').lower().replace('_', ' ').strip()
        
        # Index results by modality
        self.results_by_modality = {}
        for result in inference_results:
            modality = result.get('modality', '')
            self.results_by_modality[modality] = result
    
    def decide(self):
        """Main decision logic."""
        
        # Step 1: Check if we have any results yet
        if not self.inference_results:
            return self._initial_modality_selection()
        
        # Step 2: Check for high-risk patterns requiring reasoning
        if self._has_high_risk_pattern():
            return {
                'decision': 'NEED_REASONING',
                'rationale': '고위험 패턴 감지 — 임상 통합 판단 필요',
                'risk_level': 'high',
                'confidence_summary': self._get_confidence_summary()
            }

        # Step 3 & 4 — 임상 findings 키워드 매칭이 항상 우선 (예: ECG hyperkalemia → LAB).
        # findings 매칭 없을 때만 신뢰도/누락 모달 기반으로 fallback.
        if self.iteration <= self.MAX_ITERATIONS:
            suggested = self._suggest_based_on_findings()
            if suggested:
                completed_ko = self._mods_ko(self.modalities_completed)
                next_ko = self._mods_ko(suggested)
                top_findings = []
                for r in self.inference_results:
                    f = (r.get('finding') or '').strip()
                    if f:
                        top_findings.append(f"{r['modality']}={f[:30]}")
                findings_brief = " · ".join(top_findings[:3]) if top_findings else ""
                return {
                    'decision': 'CALL_NEXT_MODALITY',
                    'next_modalities': suggested,
                    'rationale': (
                        f"AI 후속 권고: {completed_ko} 결과({findings_brief})를 바탕으로 "
                        f"{next_ko} 추가 시행하여 정확한 감별 진단 권고."
                    ),
                    'risk_level': self._assess_risk_level(),
                    'confidence_summary': self._get_confidence_summary()
                }

            # findings 매칭 없음 → 신뢰도 낮으면 누락 모달 fallback
            if self._has_low_confidence():
                next_modalities = self._suggest_next_modalities()
                if next_modalities:
                    next_ko = self._mods_ko(next_modalities)
                    completed_ko = self._mods_ko(self.modalities_completed)
                    return {
                        'decision': 'CALL_NEXT_MODALITY',
                        'next_modalities': next_modalities,
                        'rationale': (
                            f"AI 후속 권고: 완료된 모달({completed_ko})의 신뢰도가 낮아 "
                            f"{next_ko} 추가 시행 권고."
                        ),
                        'risk_level': self._assess_risk_level(),
                        'confidence_summary': self._get_confidence_summary()
                    }
        
        # Step 5: Check if we need reasoning for complex cases
        if self._is_complex_case():
            return {
                'decision': 'NEED_REASONING',
                'rationale': 'Complex case requiring clinical reasoning synthesis',
                'risk_level': self._assess_risk_level(),
                'confidence_summary': self._get_confidence_summary()
            }
        
        # Step 6: Ready for report generation
        return {
            'decision': 'GENERATE_REPORT',
            'rationale': 'Sufficient information gathered for report generation',
            'risk_level': self._assess_risk_level(),
            'confidence_summary': self._get_confidence_summary()
        }
    
    @staticmethod
    def _mods_ko(modalities) -> str:
        ko_map = {'ECG': '심전도', 'CXR': '흉부X-ray', 'LAB': '혈액검사'}
        return ', '.join(ko_map.get(m, m) for m in (modalities or []))

    def _initial_modality_selection(self):
        """Select initial modalities based on chief complaint + past_history + complaint_detail.

        우선순위:
        1) 신장 응급 (CKD/ESRD + 혈뇨/투석 미시행 등) → ECG 우선 (hyperkalemia 의심)
        2) chief_complaint 매핑
        3) complaint_detail 키워드 매핑 ("other" 등 일반 분류)
        4) 디폴트 ['CXR', 'LAB']
        """
        past_hist = [str(h).upper() for h in (self.patient.get('past_history') or [])]
        detail_raw = str(self.patient.get('complaint_detail') or '')
        detail = detail_raw.lower()
        age = self.patient.get('age')
        sex = self.patient.get('sex')
        cc = self.chief_complaint  # already lowered

        # ── 1) 신장 응급 패턴 — ESRD/CKD + 신장 관련 증상 (병렬 오더) ───────
        renal_bg = any(k in past_hist for k in ['CKD', 'ESRD'])
        renal_clue = any(kw in detail for kw in ['혈뇨', '투석', 'dialysis', 'hematuria', 'oliguria', '소변', '신부전'])
        is_cardiac_complaint = any(k in cc for k in ['chest', 'pain', 'dyspnea', 'palpitation'])
        if (renal_bg or renal_clue) and not is_cardiac_complaint:
            return {
                'decision': 'CALL_NEXT_MODALITY',
                'next_modalities': ['ECG', 'LAB'],
                'parallel': True,   # ⭐ 병렬 오더 — AHA/NICE: STAT K+ + ECG 동시
                'rationale': (
                    f"환자({age}세 {sex}) — 과거력 {', '.join(past_hist) if past_hist else '없음'}. "
                    f"주호소: \"{detail_raw[:60]}\". "
                    f"ESRD/CKD 배경 + 신장 관련 증상으로 고칼륨혈증 의심. "
                    f"임상 가이드라인(AHA/NICE)에 따라 **ECG와 혈청 K+를 동시 시행** 권고. "
                    f"ECG로 peaked T-wave/wide QRS 위험 패턴 신속 식별, 혈액검사로 K+/BUN/Cre 정량 확진."
                ),
                'risk_level': 'high',
                'confidence_summary': {}
            }

        # ── 2) chief_complaint 표준 매핑 ────────────────────────
        modalities = []
        matched_key = None
        for key, mods in self.CHIEF_COMPLAINT_MODALITY_MAP.items():
            if key in cc:
                modalities = mods
                matched_key = key
                break

        # ── 3) complaint_detail 키워드 (chief_complaint=other 등 fallback) ──
        if not modalities:
            for key, mods in self.CHIEF_COMPLAINT_MODALITY_MAP.items():
                if key in detail:
                    modalities = mods
                    matched_key = key
                    break

        # ── 3b) 한국어 키워드 fallback — 영문 매핑 실패 시 detail 한국어로 매칭 ──
        if not modalities:
            ko_map = [
                (['흉통', '가슴 통증', '가슴통증'],   ['ECG', 'CXR'], 'ko:흉통'),
                (['호흡곤란', '숨가쁨', '숨이 차'],   ['ECG', 'CXR'], 'ko:호흡곤란'),
                (['두근거림', '심계항진'],            ['ECG'],         'ko:두근거림'),
                (['실신', '의식소실'],                ['ECG', 'LAB'],  'ko:실신'),
                (['혈뇨', '소변'],                    ['LAB', 'ECG'],  'ko:혈뇨'),
                (['발열', '고열'],                    ['LAB', 'CXR'],  'ko:발열'),
                (['복통'],                            ['LAB', 'CXR'],  'ko:복통'),
                (['외상', '낙상', '교통사고'],        ['CXR', 'LAB'],  'ko:외상'),
            ]
            for keys, mods, label in ko_map:
                if any(k in detail for k in keys):
                    modalities = mods
                    matched_key = label
                    break

        # ── 4) 디폴트 ──────────────────────────────────────────
        if not modalities:
            modalities = ['CXR', 'LAB']
            matched_key = 'default'

        # 한글 임상 rationale
        primary = modalities[0]
        primary_ko = {'ECG': '심전도', 'CXR': '흉부X-ray', 'LAB': '혈액검사'}.get(primary, primary)
        primary_reason = {
            'ECG': "심장 이상(부정맥/허혈/심근경색) 신속 배제",
            'CXR': "폐렴/기흉/심확대 등 흉부 병변 확인",
            'LAB': "감염/대사/장기 손상 마커 정량 평가",
        }.get(primary, "추가 검사 권고")

        rationale = (
            f"환자({age}세 {sex}) — 주호소 \"{detail_raw[:60] or cc}\". "
            f"과거력 {', '.join(past_hist) if past_hist else '없음'}. "
            f"AI 1차 권고: **{primary_ko}** ({primary_reason})."
        )
        return {
            'decision': 'CALL_NEXT_MODALITY',
            'next_modalities': modalities,
            'rationale': rationale,
            'risk_level': 'unknown',
            'confidence_summary': {},
            '_matched_key': matched_key,  # 디버그용
        }
    
    def _has_high_risk_pattern(self):
        """Check if results match any high-risk patterns."""
        for pattern in self.HIGH_RISK_PATTERNS:
            matches = 0
            for modality, keywords in pattern.items():
                if modality in self.results_by_modality:
                    finding = self.results_by_modality[modality].get('finding', '').lower()
                    if any(kw in finding for kw in keywords):
                        matches += 1
            
            # If all modalities in pattern match
            if matches == len(pattern):
                logger.info(f"High-risk pattern detected: {pattern}")
                return True
        
        return False
    
    def _has_low_confidence(self):
        """Check if any result has low confidence."""
        for result in self.inference_results:
            confidence = result.get('confidence', 1.0)
            if confidence < self.LOW_CONFIDENCE:
                return True
        return False
    
    def _suggest_next_modalities(self):
        """Suggest next modalities based on what's missing."""
        all_modalities = ['CXR', 'ECG', 'LAB']
        remaining = [m for m in all_modalities if m not in self.modalities_completed]
        
        # Prioritize based on chief complaint
        if 'chest' in self.chief_complaint or 'cardiac' in self.chief_complaint:
            if 'ECG' in remaining:
                return ['ECG']
        
        if 'infection' in self.chief_complaint or 'fever' in self.chief_complaint:
            if 'LAB' in remaining:
                return ['LAB']
        
        # Return first remaining modality
        return remaining[:1] if remaining else []
    
    def _suggest_based_on_findings(self):
        """Suggest modalities based on current findings."""
        suggestions = []
        
        # 키워드 약어 + 우리 모델 실제 출력 코드명 포함 (chronic_ihd, hf_detail, acute_mi 등)

        # Check CXR findings (chest-svc-v2 출력: Cardiomegaly / Pleural_Effusion / Edema /
        # Pneumothorax / Atelectasis / Enlarged_Cardiomediastinum)
        if 'CXR' in self.results_by_modality:
            cxr_finding = self.results_by_modality['CXR'].get('finding', '').lower()

            # CHF/폐 병변 → Lab 우선 (BNP/Troponin/WBC가 확진·감별 마커)
            if any(kw in cxr_finding for kw in [
                'infection', 'pneumonia', 'infiltrate', 'consolidation', 'atelectasis',
                'pleural_effusion', 'edema', 'cardiomegaly',
            ]):
                if 'LAB' not in self.modalities_completed:
                    suggestions.append('LAB')

            # 심장 관련 → ECG (Afib/허혈 평가) — Lab 다음 순위
            if any(kw in cxr_finding for kw in [
                'cardiac', 'cardiomegaly', 'heart', 'enlarged_cardiomediastinum',
                'edema', 'pleural_effusion',
            ]):
                if 'ECG' not in self.modalities_completed:
                    suggestions.append('ECG')

        # Check ECG findings (ecg-svc 출력: chronic_ihd, acute_mi, heart_failure,
        # hf_detail, afib_flutter, hyperkalemia, acute_kidney_failure, ...)
        if 'ECG' in self.results_by_modality:
            ecg_finding = self.results_by_modality['ECG'].get('finding', '').lower()

            # 허혈/경색/심부전 → 영상(CXR) + 효소(Lab)
            # ⚠ 'mi' 단독은 'hyperkalemia' / 'tachycardia'에 substring으로 잡혀 false positive 유발 → 'acute_mi'/'_mi'만 사용
            if any(kw in ecg_finding for kw in [
                'ischemia', 'ischemic', 'ihd', 'chronic_ihd',
                'infarction', 'acute_mi', 'acutemi',
                'st elevation', 'st depression',
                'angina',
                'heart_failure', 'hf_detail', 'failure',
            ]):
                if 'LAB' not in self.modalities_completed:
                    suggestions.append('LAB')
                if 'CXR' not in self.modalities_completed:
                    suggestions.append('CXR')

            # 전해질 이상 → Lab으로 K+/Na+ 확정
            if any(kw in ecg_finding for kw in [
                'hyperkalemia', 'hypokalemia', 'calcium_disorder',
                'acute_kidney_failure', 'chronic_kidney',
            ]):
                if 'LAB' not in self.modalities_completed:
                    suggestions.append('LAB')

            # (제거) 부정맥 단독 → CXR 자동 권고는 over-triage. 임상적으로 순수 Afib는 ECG 단독으로 충분.
            # 부정맥 + HF/IHD/MI 동반 시는 위쪽 'failure'/'ihd' 룰에서 LAB+CXR 함께 권고됨.

        # Check LAB findings
        if 'LAB' in self.results_by_modality:
            lab_finding = self.results_by_modality['LAB'].get('finding', '').lower()

            # 심장 마커 상승 → ECG 재평가
            if any(kw in lab_finding for kw in [
                'elevated troponin', 'troponin', 'cardiac markers',
                'bnp', 'ntprobnp', 'nt-probnp',
            ]):
                if 'ECG' not in self.modalities_completed:
                    suggestions.append('ECG')

            # 고칼륨혈증 → ECG로 심독성 평가
            if any(kw in lab_finding for kw in [
                'hyperkalemia', 'k+', 'potassium',
            ]):
                if 'ECG' not in self.modalities_completed:
                    suggestions.append('ECG')

            # 신부전/감염 → CXR로 폐부종/폐렴 평가
            # 단, ESRD/CKD 환자의 BUN/Cre 상승은 baseline → CXR 추가 불필요
            past_hist = [str(h).upper() for h in (self.patient.get('past_history') or [])]
            renal_baseline = any(k in past_hist for k in ['CKD', 'ESRD'])
            renal_clue = any(kw in lab_finding for kw in [
                'creatinine', 'bun', 'kidney', 'renal failure',
            ])
            infection_clue = any(kw in lab_finding for kw in [
                'leukocytosis', 'sepsis', 'lactate',
            ])
            if (renal_clue and not renal_baseline) or infection_clue:
                if 'CXR' not in self.modalities_completed:
                    suggestions.append('CXR')

            # 고칼륨혈증 + ECG 이미 완료 → 더 이상 추가 모달 불필요 (조기 종결)
            hyperk_confirmed = any(kw in lab_finding for kw in [
                'hyperkalemia', 'critical_potassium_high', 'potassium',
            ]) and 'ECG' in self.modalities_completed
            if hyperk_confirmed:
                return []   # 진단 충분 — 추가 모달 권고 없이 보고서 생성으로

        # 중복 제거 + 이미 완료된 모달 필터링
        deduped: list[str] = []
        for s in suggestions:
            if s in self.modalities_completed:
                continue
            if s in deduped:
                continue
            deduped.append(s)
        return deduped
    
    def _is_complex_case(self):
        """Determine if case is complex enough to need reasoning."""
        # Multiple modalities with mixed findings
        if len(self.inference_results) >= 2:
            findings = [r.get('finding', '').lower() for r in self.inference_results]
            
            # Check for conflicting or complex findings
            has_abnormal = any(
                any(kw in f for kw in ['abnormal', 'elevated', 'positive', 'detected'])
                for f in findings
            )
            
            if has_abnormal:
                return True
        
        return False
    
    def _assess_risk_level(self):
        """Assess overall risk level based on findings."""
        if not self.inference_results:
            return 'unknown'
        
        # Check for high-risk keywords
        high_risk_keywords = [
            'stemi', 'st elevation', 'pneumothorax', 'massive', 'severe',
            'critical', 'acute', 'emergency'
        ]
        
        medium_risk_keywords = [
            'pneumonia', 'infiltrate', 'cardiomegaly', 'arrhythmia',
            'elevated', 'abnormal'
        ]
        
        all_findings = ' '.join([r.get('finding', '').lower() for r in self.inference_results])
        
        if any(kw in all_findings for kw in high_risk_keywords):
            return 'high'
        elif any(kw in all_findings for kw in medium_risk_keywords):
            return 'medium'
        else:
            return 'low'
    
    def _get_confidence_summary(self):
        """Get confidence summary for all modalities."""
        summary = {}
        for result in self.inference_results:
            modality = result.get('modality', 'unknown')
            confidence = result.get('confidence', 0.0)
            summary[modality] = confidence
        return summary
