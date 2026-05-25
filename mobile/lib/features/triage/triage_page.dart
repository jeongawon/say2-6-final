import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/triage_api.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/emon_top_bar.dart';
import '../../shared/widgets/top_notification_banner.dart';

/// frontend/src/pages/v2/TriagePage.tsx의 "환자정보입력" 폼을 모바일로 적응.
/// 간호사가 환자를 등록하는 박스형 폼. 데모 전용 — 백엔드 호출 없음.
/// 섹션 순서: 환자 정보 → 주호소 → KTAS → 활력징후 → 과거력.
/// 'AI 분석 시작' 버튼은 필수 항목(등록번호·환자명·나이·주호소)이 채워지면 활성화.
class TriagePage extends StatefulWidget {
  const TriagePage({super.key});

  @override
  State<TriagePage> createState() => _TriagePageState();
}

class _TriagePageState extends State<TriagePage> {
  // 1. 환자 정보
  final _mrnCtrl = TextEditingController();
  final _nameCtrl = TextEditingController();
  final _ageCtrl = TextEditingController();
  final _arrivalCtrl = TextEditingController();
  String _gender = 'male'; // 'male' | 'female'

  // 2. 주호소
  final _complaintCtrl = TextEditingController();

  // 3. KTAS
  int _ktas = 3;

  // 4. 활력징후
  final _hrCtrl = TextEditingController();
  final _sbpCtrl = TextEditingController();
  final _dbpCtrl = TextEditingController();
  final _rrCtrl = TextEditingController();
  final _spo2Ctrl = TextEditingController();
  final _btCtrl = TextEditingController();
  final _painCtrl = TextEditingController();

  // 5. 과거력
  static const _historyOptions = <String>[
    '고혈압',
    '당뇨',
    '관상동맥질환',
    '뇌졸중',
    'COPD',
    '천식',
    '만성신부전',
    '심방세동',
  ];
  final Set<String> _history = <String>{};

  bool _submitting = false;

  @override
  void initState() {
    super.initState();
    // 내원 일시 기본값 — 현재 시각 (데모: 읽기 전용 느낌으로 채워둠)
    final now = DateTime.now();
    String two(int v) => v.toString().padLeft(2, '0');
    _arrivalCtrl.text =
        '${now.year}-${two(now.month)}-${two(now.day)} ${two(now.hour)}:${two(now.minute)}';

    // 데모 시연용 — 양정인(MIMIC subject 18230098) 테스트케이스 미리 채움
    _mrnCtrl.text = '18230098';
    _nameCtrl.text = '양정인';
    _ageCtrl.text = '86';
    _gender = 'female';
    _complaintCtrl.text = '4시간 전 발생한 흉통. 다중 고위험 기저질환 (만성 HF·ESRD·기왕 MI·Afib·DM).';
    _ktas = 2;
    _hrCtrl.text = '98';
    _sbpCtrl.text = '138';
    _dbpCtrl.text = '82';
    _rrCtrl.text = '26';
    _spo2Ctrl.text = '92';
    _btCtrl.text = '36.7';
    _history.addAll(const ['고혈압', '당뇨', '관상동맥질환', '만성신부전', '심방세동']);

    // 필수 항목 입력 변화 → 버튼 활성화 갱신
    _mrnCtrl.addListener(_onChanged);
    _nameCtrl.addListener(_onChanged);
    _ageCtrl.addListener(_onChanged);
    _complaintCtrl.addListener(_onChanged);
  }

  void _onChanged() => setState(() {});

  @override
  void dispose() {
    _mrnCtrl.dispose();
    _nameCtrl.dispose();
    _ageCtrl.dispose();
    _arrivalCtrl.dispose();
    _complaintCtrl.dispose();
    _hrCtrl.dispose();
    _sbpCtrl.dispose();
    _dbpCtrl.dispose();
    _rrCtrl.dispose();
    _spo2Ctrl.dispose();
    _btCtrl.dispose();
    _painCtrl.dispose();
    super.dispose();
  }

  bool get _canSubmit =>
      _mrnCtrl.text.trim().isNotEmpty &&
      _nameCtrl.text.trim().isNotEmpty &&
      _ageCtrl.text.trim().isNotEmpty &&
      _complaintCtrl.text.trim().isNotEmpty;

  Future<void> _submit() async {
    if (!_canSubmit || _submitting) return;
    setState(() => _submitting = true);
    try {
      // 실제 백엔드 /triage/submit — encounter 생성 + 1차 AI 권고 트리거.
      final r = await submitTriage(
        mrn: _mrnCtrl.text.trim(),
        name: _nameCtrl.text.trim(),
        age: int.tryParse(_ageCtrl.text.trim()) ?? 0,
        gender: _gender,
        complaint: _complaintCtrl.text.trim(),
        hr: _hrCtrl.text,
        sbp: _sbpCtrl.text,
        dbp: _dbpCtrl.text,
        rr: _rrCtrl.text,
        spo2: _spo2Ctrl.text,
        bt: _btCtrl.text,
        history: _history,
      );
      if (!mounted) return;
      TopNotificationBanner.show(context,
          title: '트리아지 등록 완료',
          body: '$_nameText — AI 분석을 시작합니다',
          duration: const Duration(seconds: 2));
      // AI 분석 페이지로 이동 (encounter_id 기준)
      context.go('/patient/${r.encounterId}');
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      TopNotificationBanner.show(context,
          title: '트리아지 등록 실패',
          body: '백엔드 연결을 확인하세요 ($e)',
          duration: const Duration(seconds: 3));
    }
  }

  String get _nameText => _nameCtrl.text.trim();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: const EmonTopBar(current: 'triage'),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 560),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                _buildPatientSection(),
                const SizedBox(height: 16),
                _buildComplaintSection(),
                const SizedBox(height: 16),
                _buildKtasSection(),
                const SizedBox(height: 16),
                _buildVitalsSection(),
                const SizedBox(height: 16),
                _buildHistorySection(),
                const SizedBox(height: 20),
                _buildSubmitButton(),
                const SizedBox(height: 16),
              ],
            ),
          ),
        ),
      ),
    );
  }

  // ── Section 1: 환자 정보 ────────────────────────────────────────────
  Widget _buildPatientSection() {
    return _Section(
      title: '환자 정보',
      subtitle: 'Patient Identification',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _LabeledField(
            label: '등록번호 (MRN)',
            controller: _mrnCtrl,
            hint: '예) 1000123',
            keyboardType: TextInputType.text,
          ),
          const SizedBox(height: 14),
          _LabeledField(
            label: '환자명',
            controller: _nameCtrl,
            hint: '예) 홍길동',
          ),
          const SizedBox(height: 14),
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(
                child: _LabeledField(
                  label: '나이',
                  controller: _ageCtrl,
                  hint: '세',
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: false),
                  inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                  suffix: '세',
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const _FieldLabel('성별'),
                    const SizedBox(height: 6),
                    _GenderToggle(
                      value: _gender,
                      onChanged: (g) => setState(() => _gender = g),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          _LabeledField(
            label: '내원 일시',
            controller: _arrivalCtrl,
            readOnly: true,
          ),
        ],
      ),
    );
  }

  // ── Section 2: 주호소 ──────────────────────────────────────────────
  Widget _buildComplaintSection() {
    return _Section(
      title: '주호소',
      subtitle: 'Chief Complaint',
      child: _LabeledField(
        label: '주호소',
        controller: _complaintCtrl,
        hint: '예) 2시간 전부터 시작된 흉통, 식은땀 동반',
        maxLines: 4,
        keyboardType: TextInputType.multiline,
      ),
    );
  }

  // ── Section 3: KTAS Level ─────────────────────────────────────────
  Widget _buildKtasSection() {
    final meta = KtasMeta.of(_ktas);
    return _Section(
      title: 'KTAS Level',
      subtitle: 'Korean Triage and Acuity Scale',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              for (var k = 1; k <= 5; k++) ...[
                Expanded(child: _KtasButton(
                  level: k,
                  selected: _ktas == k,
                  onTap: () => setState(() => _ktas = k),
                )),
                if (k < 5) const SizedBox(width: 8),
              ],
            ],
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: meta.bg,
                  borderRadius: BorderRadius.circular(3),
                ),
              ),
              const SizedBox(width: 8),
              Text(
                '선택: Level $_ktas · ${meta.label}',
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: AppColors.slate700,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  // ── Section 4: 활력징후 ────────────────────────────────────────────
  Widget _buildVitalsSection() {
    return _Section(
      title: '활력징후',
      subtitle: 'Vital Signs',
      child: LayoutBuilder(
        builder: (context, constraints) {
          // 2열 그리드 — 화면 폭에 따라 칸 너비 계산.
          const gap = 12.0;
          final colW = (constraints.maxWidth - gap) / 2;
          Widget cell(Widget child) =>
              SizedBox(width: colW, child: child);
          return Wrap(
            spacing: gap,
            runSpacing: 14,
            children: [
              cell(_LabeledField(
                label: '심박수 (HR)',
                controller: _hrCtrl,
                hint: '회/분',
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                suffix: 'bpm',
              )),
              cell(_LabeledField(
                label: '수축기 (SBP)',
                controller: _sbpCtrl,
                hint: '수축기 혈압',
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                suffix: 'mmHg',
              )),
              cell(_LabeledField(
                label: '이완기 (DBP)',
                controller: _dbpCtrl,
                hint: '이완기 혈압',
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                suffix: 'mmHg',
              )),
              cell(_LabeledField(
                label: '호흡수 (RR)',
                controller: _rrCtrl,
                hint: '회/분',
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                suffix: '/min',
              )),
              cell(_LabeledField(
                label: '산소포화도 (SpO₂)',
                controller: _spo2Ctrl,
                hint: '0~100',
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                suffix: '%',
              )),
              cell(_LabeledField(
                label: '체온 (BT)',
                controller: _btCtrl,
                hint: '예) 36.5',
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                inputFormatters: [
                  FilteringTextInputFormatter.allow(RegExp(r'[0-9.]')),
                ],
                suffix: '℃',
              )),
              cell(_LabeledField(
                label: '통증 (Pain)',
                controller: _painCtrl,
                hint: '0~10',
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: false),
                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                suffix: '/10',
              )),
            ],
          );
        },
      ),
    );
  }

  // ── Section 5: 과거력 ──────────────────────────────────────────────
  Widget _buildHistorySection() {
    return _Section(
      title: '과거력',
      subtitle: 'Medical History',
      child: Wrap(
        spacing: 8,
        runSpacing: 8,
        children: [
          for (final opt in _historyOptions)
            _HistoryChip(
              label: opt,
              selected: _history.contains(opt),
              onTap: () => setState(() {
                if (!_history.add(opt)) _history.remove(opt);
              }),
            ),
        ],
      ),
    );
  }

  // ── 하단 제출 버튼 ────────────────────────────────────────────────
  Widget _buildSubmitButton() {
    final enabled = _canSubmit && !_submitting;
    return SizedBox(
      width: double.infinity,
      height: 52,
      child: ElevatedButton(
        onPressed: enabled ? _submit : null,
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.brand600,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.slate300,
          disabledForegroundColor: AppColors.slate50,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(8),
          ),
        ),
        child: _submitting
            ? const SizedBox(
                width: 22,
                height: 22,
                child: CircularProgressIndicator(
                  strokeWidth: 2.4,
                  valueColor: AlwaysStoppedAnimation<Color>(Colors.white),
                ),
              )
            : const Text(
                'AI 분석 시작',
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.bold,
                ),
              ),
      ),
    );
  }
}

/// 흰 배경 + slate 보더 박스 카드. 14-bold slate900 타이틀 + 옵션 영문 부제(slate400).
class _Section extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;
  const _Section({
    required this.title,
    this.subtitle,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate200),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Text(
                title,
                style: const TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.bold,
                  color: AppColors.slate900,
                ),
              ),
              if (subtitle != null) ...[
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    subtitle!,
                    style: const TextStyle(
                      fontSize: 11,
                      color: AppColors.slate400,
                    ),
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 14),
          child,
        ],
      ),
    );
  }
}

/// 입력 위 13-15 bold slate800 라벨.
class _FieldLabel extends StatelessWidget {
  final String text;
  const _FieldLabel(this.text);

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.bold,
        color: AppColors.slate800,
      ),
    );
  }
}

/// 라벨 + TextField 묶음. 흰 fill, slate200 보더, radius 10.
class _LabeledField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final String? hint;
  final TextInputType? keyboardType;
  final List<TextInputFormatter>? inputFormatters;
  final int maxLines;
  final bool readOnly;
  final String? suffix;

  const _LabeledField({
    required this.label,
    required this.controller,
    this.hint,
    this.keyboardType,
    this.inputFormatters,
    this.maxLines = 1,
    this.readOnly = false,
    this.suffix,
  });

  @override
  Widget build(BuildContext context) {
    OutlineInputBorder border(Color c) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: c),
        );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label),
        const SizedBox(height: 6),
        TextField(
          controller: controller,
          keyboardType: keyboardType,
          inputFormatters: inputFormatters,
          maxLines: maxLines,
          readOnly: readOnly,
          style: const TextStyle(
            fontSize: 14,
            color: AppColors.slate900,
          ),
          decoration: InputDecoration(
            isDense: true,
            filled: true,
            fillColor: readOnly ? AppColors.slate50 : Colors.white,
            hintText: hint,
            hintStyle: const TextStyle(
              fontSize: 14,
              color: AppColors.slate400,
            ),
            suffixText: suffix,
            suffixStyle: const TextStyle(
              fontSize: 12,
              color: AppColors.slate400,
              fontWeight: FontWeight.w600,
            ),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            enabledBorder: border(AppColors.slate200),
            focusedBorder: border(AppColors.brand500),
            border: border(AppColors.slate200),
          ),
        ),
      ],
    );
  }
}

/// 남/여 토글 (세그먼트형). 선택 = brand600 fill 흰 글씨.
class _GenderToggle extends StatelessWidget {
  final String value; // 'male' | 'female'
  final ValueChanged<String> onChanged;
  const _GenderToggle({required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: AppColors.slate50,
        border: Border.all(color: AppColors.slate200),
        borderRadius: BorderRadius.circular(10),
      ),
      padding: const EdgeInsets.all(3),
      child: Row(
        children: [
          Expanded(child: _seg('남', 'male')),
          Expanded(child: _seg('여', 'female')),
        ],
      ),
    );
  }

  Widget _seg(String label, String key) {
    final selected = value == key;
    return GestureDetector(
      onTap: () => onChanged(key),
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        height: 38,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? AppColors.brand600 : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 14,
            fontWeight: FontWeight.bold,
            color: selected ? Colors.white : AppColors.slate600,
          ),
        ),
      ),
    );
  }
}

/// KTAS 1~5 선택 버튼. 선택 = meta.bg fill + 흰 글씨 + meta.label.
/// 미선택 = slate50 bg + slate200 보더.
class _KtasButton extends StatelessWidget {
  final int level;
  final bool selected;
  final VoidCallback onTap;
  const _KtasButton({
    required this.level,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final meta = KtasMeta.of(level);
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? meta.bg : AppColors.slate50,
          border: Border.all(
            color: selected ? meta.bg : AppColors.slate200,
          ),
          borderRadius: BorderRadius.circular(8),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              '$level',
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.bold,
                color: selected ? Colors.white : AppColors.slate700,
              ),
            ),
            const SizedBox(height: 2),
            Text(
              meta.label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w600,
                color: selected ? Colors.white : AppColors.slate500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// 과거력 토글 칩. 선택 = brand600 bg 흰 글씨. 미선택 = slate50 bg slate200 보더.
class _HistoryChip extends StatelessWidget {
  final String label;
  final bool selected;
  final VoidCallback onTap;
  const _HistoryChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 120),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
        decoration: BoxDecoration(
          color: selected ? AppColors.brand600 : AppColors.slate50,
          border: Border.all(
            color: selected ? AppColors.brand600 : AppColors.slate200,
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(
          label,
          style: TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.w600,
            color: selected ? Colors.white : AppColors.slate700,
          ),
        ),
      ),
    );
  }
}
