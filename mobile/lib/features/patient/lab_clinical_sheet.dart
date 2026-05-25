import 'package:flutter/material.dart';

import '../../shared/theme/app_theme.dart';

/// 혈액 검사 결과지 — backend LAB modal의 lab_summary + prognosis_6h.
class LabClinicalSheet extends StatelessWidget {
  final String patientName;
  final int age;
  final String sex;
  final String? patientId;
  final List<Map<String, dynamic>> labSummary;
  final Map<String, dynamic>? prognosis6h;
  final String? summary;
  final String? riskLevel;

  const LabClinicalSheet({
    super.key,
    this.patientName = '환자',
    this.age = 0,
    this.sex = 'M',
    this.patientId,
    this.labSummary = const [],
    this.prognosis6h,
    this.summary,
    this.riskLevel,
  });

  String get _sexLabel => sex == 'M' ? '남' : sex == 'F' ? '여' : sex;

  @override
  Widget build(BuildContext context) {
    return Container(
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _Header(
            patientName: patientName,
            age: age,
            sexLabel: _sexLabel,
            patientId: patientId,
            riskLevel: riskLevel,
          ),
          // lab_summary 표
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionLabel('혈액 검사 결과 (Lab Summary)'),
                const SizedBox(height: 6),
                Container(
                  decoration: BoxDecoration(
                    border: Border.all(color: AppColors.slate200),
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: Column(
                    children: [
                      // 헤더
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 8, vertical: 6),
                        decoration: const BoxDecoration(
                          color: AppColors.slate100,
                          border: Border(
                              bottom: BorderSide(color: AppColors.slate200)),
                        ),
                        child: Row(
                          children: const [
                            Expanded(flex: 5, child: _ColH('항목')),
                            Expanded(
                                flex: 3,
                                child: _ColH('결과', align: TextAlign.right)),
                            Expanded(
                                flex: 4, child: _ColH('참고치 (단위)')),
                            SizedBox(width: 30, child: _ColH('Flag')),
                          ],
                        ),
                      ),
                      if (labSummary.isEmpty)
                        const Padding(
                          padding: EdgeInsets.all(16),
                          child: Text('검사 결과 없음',
                              style: TextStyle(
                                  fontSize: 11,
                                  color: AppColors.slate400)),
                        )
                      else
                        for (int i = 0; i < labSummary.length; i++)
                          _LabRow(
                              row: labSummary[i],
                              isLast: i == labSummary.length - 1),
                    ],
                  ),
                ),
              ],
            ),
          ),
          // 6시간 후 악화 예측
          if (prognosis6h != null) _PrognosisCard(prognosis: prognosis6h!),
          // 요약
          if (summary != null && summary!.isNotEmpty)
            Container(
              margin: const EdgeInsets.all(12),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                border: Border.all(color: AppColors.slate300),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _SectionLabel('요약 (Summary)'),
                  const SizedBox(height: 4),
                  Text(summary!,
                      style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.slate800,
                          height: 1.6)),
                ],
              ),
            ),
          _Footer(modal: 'LAB'),
        ],
      ),
    );
  }
}

Future<void> showLabClinicalSheet(
  BuildContext context, {
  required String patientName,
  required int age,
  required String sex,
  String? patientId,
  List<Map<String, dynamic>> labSummary = const [],
  Map<String, dynamic>? prognosis6h,
  String? summary,
  String? riskLevel,
}) {
  return showDialog<void>(
    context: context,
    barrierColor: Colors.black54,
    builder: (ctx) => Dialog.fullscreen(
      backgroundColor: AppColors.slate100,
      child: Scaffold(
        backgroundColor: AppColors.slate100,
        appBar: AppBar(
          leading: const SizedBox(),
          leadingWidth: 0,
          title: const Text('혈액 검사 결과지',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppColors.slate900)),
          actions: [
            IconButton(
                icon: const Icon(Icons.close, color: AppColors.slate700),
                onPressed: () => Navigator.pop(ctx)),
          ],
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: AppColors.slate300),
              borderRadius: BorderRadius.circular(4),
            ),
            child: LabClinicalSheet(
              patientName: patientName,
              age: age,
              sex: sex,
              patientId: patientId,
              labSummary: labSummary,
              prognosis6h: prognosis6h,
              summary: summary,
              riskLevel: riskLevel,
            ),
          ),
        ),
      ),
    ),
  );
}

// 백엔드 LAB 응답의 feature 키(영문)를 의사용 한국어 라벨로 매핑.
// 백엔드: app/clients/lab_loader.py 의 LOINC/MIMIC feature 식별자와 일치.
const Map<String, String> _featureLabelKo = {
  'wbc': '백혈구 (WBC)',
  'hemoglobin': '헤모글로빈 (Hb)',
  'hematocrit': '헤마토크릿 (Hct)',
  'platelet': '혈소판 (PLT)',
  'creatinine': '크레아티닌 (Cr)',
  'bun': 'BUN',
  'sodium': '나트륨 (Na+)',
  'potassium': '칼륨 (K+)',
  'chloride': '염소 (Cl-)',
  'bicarbonate': '중탄산 (HCO3-)',
  'glucose': '혈당 (Glu)',
  'calcium': '칼슘 (Ca2+)',
  'magnesium': '마그네슘 (Mg2+)',
  'phosphate': '인 (PO4)',
  'ast': 'AST (GOT)',
  'alt': 'ALT (GPT)',
  'alp': 'ALP',
  'albumin': '알부민 (Alb)',
  'total_bilirubin': '총 빌리루빈',
  'lactate': '젖산 (Lactate)',
  'ck_mb': 'CK-MB',
  'troponin_t': '트로포닌 T',
  'nt_probnp': 'NT-proBNP',
  'crp': 'CRP',
  'd_dimer': 'D-dimer',
  'procalcitonin': '프로칼시토닌',
  'inr': 'INR',
  'ph': 'pH (혈가스)',
  'po2': 'PaO2',
  'pco2': 'PaCO2',
  'hco3': 'HCO3-',
  'base_excess': '염기과잉 (BE)',
  'spo2': 'SpO2',
};

String _humanFeatureName(String feature) {
  final key = feature.toLowerCase().trim();
  return _featureLabelKo[key] ?? feature.toUpperCase();
}

class _LabRow extends StatelessWidget {
  final Map<String, dynamic> row;
  final bool isLast;
  const _LabRow({required this.row, required this.isLast});

  @override
  Widget build(BuildContext context) {
    // ── 백엔드 lab_summary 스키마 우선 (feature/status/reference_low+high) ──
    // 옛 스키마 호환: name/flag/ref_range 도 fallback.
    final featureRaw = row['feature']?.toString()
        ?? row['name']?.toString()
        ?? row['item']?.toString()
        ?? row['label']?.toString();
    final name = featureRaw != null ? _humanFeatureName(featureRaw) : '—';
    final value = (row['value'] ?? '—').toString();
    final unit = row['unit']?.toString();

    // ref: reference_low ~ reference_high 조합 우선
    String? ref;
    final refLow = row['reference_low'];
    final refHigh = row['reference_high'];
    if (refLow != null && refHigh != null) {
      ref = '$refLow~$refHigh';
    } else {
      ref = row['ref_range']?.toString() ?? row['reference']?.toString();
    }

    // status → flag 변환 (backend: 'normal'/'high'/'low'/'critical')
    final status = (row['status']?.toString() ?? row['flag']?.toString() ?? '').toLowerCase();
    String flag = '';
    if (status == 'high' || status == 'h') {
      flag = 'H';
    } else if (status == 'critical_high') {
      flag = 'HH';
    } else if (status == 'low' || status == 'l') {
      flag = 'L';
    } else if (status == 'critical_low') {
      flag = 'LL';
    } else if (status == 'critical') {
      flag = '!';
    }

    final abnormal = status.isNotEmpty && status != 'normal' && status != 'unmeasured';
    final flagColor = (flag == 'H' || flag == 'HH')
        ? AppColors.critical
        : (flag == 'L' || flag == 'LL')
            ? const Color(0xFF2563EB)
            : AppColors.slate700;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        border: isLast
            ? null
            : const Border(
                bottom: BorderSide(color: AppColors.slate100)),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 5,
            child: Text(name,
                style: const TextStyle(
                    fontSize: 11, color: AppColors.slate800)),
          ),
          Expanded(
            flex: 3,
            child: Text(value,
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontSize: 11,
                    fontFamily: 'monospace',
                    fontWeight: FontWeight.bold,
                    color: abnormal
                        ? AppColors.critical
                        : AppColors.slate900)),
          ),
          Expanded(
            flex: 4,
            child: Padding(
              padding: const EdgeInsets.only(left: 8),
              child: Text(
                ref != null
                    ? '$ref${unit != null ? " $unit" : ""}'
                    : (unit ?? ''),
                style: const TextStyle(
                    fontSize: 10,
                    color: AppColors.slate400,
                    fontFamily: 'monospace'),
              ),
            ),
          ),
          SizedBox(
            width: 30,
            child: Text(
              flag.isNotEmpty ? flag : '',
              textAlign: TextAlign.center,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  color: flagColor),
            ),
          ),
        ],
      ),
    );
  }
}

// 웹과 동일한 6h 예측 5개 메트릭 라벨 (PROG_KO)
const Map<String, String> _prog6hLabel = {
  'hemoglobin_down': 'Hemoglobin 감소',
  'creatinine_up':   'Creatinine 증가',
  'potassium_worse': 'Potassium 악화',
  'lactate_up':      'Lactate 증가',
  'troponin_up':     'Troponin 상승',
};

class _PrognosisCard extends StatelessWidget {
  final Map<String, dynamic> prognosis;
  const _PrognosisCard({required this.prognosis});

  @override
  Widget build(BuildContext context) {
    // 웹 ModalViews.tsx 의 LabPrognosisChart 와 동일한 5개 메트릭 — XGBoost 5-앙상블 출력
    final metrics = _prog6hLabel.entries.map((e) {
      final v = (prognosis[e.key] as num?)?.toDouble() ?? 0.0;
      return (key: e.key, label: e.value, value: v);
    }).toList();

    final mean = metrics.isEmpty
        ? 0.0
        : metrics.map((m) => m.value).reduce((a, b) => a + b) / metrics.length;

    final Color toneFg;
    final Color toneBg;
    final Color toneBorder;
    final String toneLabel;
    if (mean >= 0.6) {
      toneLabel = '고위험';
      toneFg = AppColors.critical;
      toneBg = AppColors.critical.withAlpha(20);
      toneBorder = AppColors.critical.withAlpha(150);
    } else if (mean >= 0.4) {
      toneLabel = '중간 위험';
      toneFg = AppColors.amber700;
      toneBg = AppColors.amber50;
      toneBorder = AppColors.amber300;
    } else {
      toneLabel = '저위험';
      toneFg = AppColors.emerald600;
      toneBg = AppColors.emerald600.withAlpha(20);
      toneBorder = AppColors.emerald600.withAlpha(120);
    }

    // warnings 배열 (백엔드 prognosis_6h.warnings)
    final warnings = (prognosis['warnings'] as List?)?.cast<String>() ?? const [];

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 12),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: toneBg,
        border: Border.all(color: toneBorder),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 헤더 — 6시간 후 악화 예측 + 종합 등급
          Row(
            children: [
              Icon(Icons.trending_up, size: 16, color: toneFg),
              const SizedBox(width: 6),
              const Expanded(
                child: Text('XGBoost 5-앙상블 · 6시간 후 악화 예측',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppColors.slate800)),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                decoration: BoxDecoration(
                  color: toneFg.withAlpha(30),
                  border: Border(left: BorderSide(color: toneFg, width: 3)),
                ),
                child: Text(
                  '종합 $toneLabel ${(mean * 100).toStringAsFixed(0)}%',
                  style: TextStyle(
                      fontSize: 11, fontWeight: FontWeight.bold, color: toneFg),
                ),
              ),
            ],
          ),
          // warnings 표시
          if (warnings.isNotEmpty) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.critical.withAlpha(25),
                border: Border.all(color: AppColors.critical.withAlpha(120)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.warning_amber, size: 12, color: AppColors.critical),
                  const SizedBox(width: 4),
                  Expanded(
                    child: Text(
                      '경고: ${warnings.join(", ")}',
                      style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: AppColors.critical),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          // 5개 메트릭 막대 차트
          ...metrics.map((m) => Padding(
                padding: const EdgeInsets.only(bottom: 4),
                child: _Prog6hBar(label: m.label, value: m.value),
              )),
        ],
      ),
    );
  }
}

// 6h 예측 단일 메트릭 막대 — label + 0~100% bar + 값
class _Prog6hBar extends StatelessWidget {
  final String label;
  final double value; // 0.0 ~ 1.0
  const _Prog6hBar({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final pct = (value * 100).clamp(0, 100);
    final Color barColor = value >= 0.6
        ? AppColors.critical
        : value >= 0.4
            ? AppColors.amber700
            : AppColors.emerald600;
    return Row(
      children: [
        SizedBox(
          width: 96,
          child: Text(label,
              style: const TextStyle(fontSize: 10, color: AppColors.slate700)),
        ),
        Expanded(
          child: Container(
            height: 10,
            decoration: BoxDecoration(
              color: AppColors.slate100,
              borderRadius: BorderRadius.circular(2),
            ),
            child: FractionallySizedBox(
              alignment: Alignment.centerLeft,
              widthFactor: value.clamp(0.0, 1.0).toDouble(),
              child: Container(
                decoration: BoxDecoration(
                  color: barColor,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        SizedBox(
          width: 36,
          child: Text(
            '${pct.toStringAsFixed(0)}%',
            textAlign: TextAlign.right,
            style: TextStyle(
                fontSize: 10,
                fontFamily: 'monospace',
                fontWeight: FontWeight.bold,
                color: barColor),
          ),
        ),
      ],
    );
  }
}

// 공통 헬퍼 — cxr_clinical_sheet과 동일 구조
class _Header extends StatelessWidget {
  final String patientName;
  final int age;
  final String sexLabel;
  final String? patientId;
  final String? riskLevel;
  const _Header({
    required this.patientName,
    required this.age,
    required this.sexLabel,
    this.patientId,
    this.riskLevel,
  });

  @override
  Widget build(BuildContext context) {
    final (riskBg, riskFg, riskLabel) = switch (riskLevel) {
      'critical' => (
          AppColors.critical.withAlpha(40),
          AppColors.critical,
          'CRITICAL'
        ),
      'urgent' => (
          AppColors.urgent.withAlpha(40),
          AppColors.urgent,
          'URGENT'
        ),
      'routine' => (
          AppColors.emerald100,
          AppColors.emerald700,
          'ROUTINE'
        ),
      _ => (AppColors.slate100, AppColors.slate600, '—'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.slate300))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$patientName · $sexLabel · $age세',
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: AppColors.slate900)),
                if (patientId != null)
                  Text('ID: $patientId',
                      style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.slate500,
                          fontFamily: 'monospace')),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
                color: riskBg, borderRadius: BorderRadius.circular(2)),
            child: Text(riskLabel,
                style: TextStyle(
                    color: riskFg,
                    fontSize: 10,
                    fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  final String modal;
  const _Footer({required this.modal});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.slate200))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('say-6 Deep$modal v2.0',
              style: const TextStyle(
                  fontSize: 9,
                  color: AppColors.slate400,
                  fontFamily: 'monospace')),
          const Text('응급실 멀티모달 AI 진단 보조',
              style: TextStyle(
                  fontSize: 9,
                  color: AppColors.slate400,
                  fontFamily: 'monospace')),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: AppColors.slate900));
}

class _ColH extends StatelessWidget {
  final String text;
  final TextAlign align;
  const _ColH(this.text, {this.align = TextAlign.left});
  @override
  Widget build(BuildContext context) => Text(text,
      textAlign: align,
      style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.bold,
          color: AppColors.slate600));
}
