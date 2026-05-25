import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/patient_api.dart';
import '../../core/models/ai_rec.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/emon_top_bar.dart';
import 'cxr_clinical_sheet.dart';
import 'ecg_clinical_sheet.dart';
import 'lab_clinical_sheet.dart';

/// frontend/src/pages/v2/PatientResultsPage.tsx의 모바일 포트.
/// 한 encounter의 ECG · CXR · LAB 검사결과 + AI 판독을 카드 3개로 표시.
/// 각 카드: modality 헤더(아이콘 칩 + 이름 + 라벨 + 상태 뱃지) + "검사결과지 보기" 버튼.
/// 결과가 없으면 버튼 대신 "대기" muted 상태. 하단에 "AI 종합소견 생성" 버튼.
class PatientResultsPage extends ConsumerWidget {
  final String patientId; // encounter_id
  const PatientResultsPage({super.key, required this.patientId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(patientDetailProvider(patientId));

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: EmonTopBar(current: 'results', patientId: patientId),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(
          message: '$e',
          onRetry: () => ref.invalidate(patientDetailProvider),
        ),
        data: (data) {
          const modalities = ['ECG', 'CXR', 'LAB'];
          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async => ref.invalidate(patientDetailProvider),
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      for (final m in modalities) ...[
                        _ResultCard(
                          modality: m,
                          modal: data.modalResults[m],
                          recommendations: data.recommendations,
                          patient: data.patient,
                          encounterId: patientId,
                        ),
                        const SizedBox(height: 10),
                      ],
                    ],
                  ),
                ),
              ),
              _ResultsFooter(
                onGenerate: () => context.go('/patient/$patientId/report'),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// 모달 검사결과 카드 — worklist 카드 스타일 (흰 배경 + slate300 border + radius 4)
// 헤더: 아이콘 칩 + modality 이름 + 서브 라벨 + 상태 뱃지
// 본문: "검사결과지 보기" 버튼 (결과 있을 때) / "대기" muted 상태 (없을 때)
// ────────────────────────────────────────────────────────────
class _ResultCard extends StatelessWidget {
  final String modality; // 'ECG' | 'CXR' | 'LAB'
  final ModalSummary? modal;
  final List<AIRec> recommendations;
  final PatientInfo patient;
  final String encounterId;
  const _ResultCard({
    required this.modality,
    required this.modal,
    required this.recommendations,
    required this.patient,
    required this.encounterId,
  });

  IconData get _icon => switch (modality) {
        'ECG' => Icons.monitor_heart_outlined,
        'CXR' => Icons.image_outlined,
        _ => Icons.science_outlined,
      };

  String get _label => switch (modality) {
        'ECG' => '심전도 12-Lead',
        'CXR' => '흉부 X-ray',
        _ => '혈액 검사',
      };

  // 상태 결정 — 웹 modalStatus()와 동일 의도:
  //   결과 있으면 done, 권고가 active면 running, 그 외엔 pending.
  _ModalStatus get _status {
    if (modal != null && modal!.isDone) return _ModalStatus.done;
    final rec = recommendations.where((r) => r.modality == modality);
    if (rec.any((r) => r.isRunning)) return _ModalStatus.running;
    return _ModalStatus.pending;
  }

  void _openSheet(BuildContext context) {
    final m = modal;
    final patientName = patient.name ?? '환자';
    final age = patient.age ?? 0;
    final sex = patient.sex;
    // 차트 헤더용 ID — subject_id 우선, 없으면 encounter UUID 앞 8자리
    final id = patient.subjectId ?? encounterId.substring(0, 8);

    if (modality == 'ECG') {
      showEcgClinicalSheet(
        context,
        patientName: patientName,
        age: age,
        sex: sex,
        patientId: id,
        waveform: m?.ecgWaveform,
        ecgVitals: m?.ecgVitals,
        findings: m?.findings ?? const [],
      );
    } else if (modality == 'CXR') {
      showCxrClinicalSheet(
        context,
        patientName: patientName,
        age: age,
        sex: sex,
        patientId: id,
        subjectId: patient.subjectId,
        measurements: m?.cxrMeasurements,
        metadata: m?.cxrMetadata,
        // 영어 findings_text 대신 한국어 재구성 소견을 '결론'으로 표시
        findingsText: const [],
        impression: m?.cxrKoreanSummary,
        summary: m?.summary,
        riskLevel: m?.riskLevel,
      );
    } else if (modality == 'LAB') {
      showLabClinicalSheet(
        context,
        patientName: patientName,
        age: age,
        sex: sex,
        patientId: id,
        labSummary: m?.labSummary ?? const [],
        prognosis6h: m?.prognosis6h,
        summary: m?.summary,
        riskLevel: m?.riskLevel,
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final hasResult = status == _ModalStatus.done && modal != null;

    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.slate300),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // 헤더 행 — 아이콘 칩 + modality + 서브 라벨 + 상태 뱃지
            Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: AppColors.brand50,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Icon(_icon, size: 15, color: AppColors.brand600),
                ),
                const SizedBox(width: 8),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(modality,
                        style: const TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: AppColors.slate900,
                            height: 1)),
                    const SizedBox(height: 2),
                    Text(_label,
                        style: const TextStyle(
                            fontSize: 10, color: AppColors.slate400)),
                  ],
                ),
                const Spacer(),
                _StatusBadge(status: status),
              ],
            ),
            const SizedBox(height: 10),
            // 본문 — 한 줄 요약 + "검사결과지 보기" 버튼 / "대기" muted
            // CXR은 영어 출력이라 구조화 소견으로 한국어 재구성(cxrKoreanSummary).
            if (hasResult) ...[
              if (() {
                final t = modality == 'CXR'
                    ? modal!.cxrKoreanSummary
                    : (modal!.summary ?? '');
                return t.isNotEmpty;
              }()) ...[
                Text(
                  modality == 'CXR'
                      ? modal!.cxrKoreanSummary
                      : modal!.summary!,
                  style: const TextStyle(
                      fontSize: 12, color: AppColors.slate600, height: 1.4),
                  maxLines: 4,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 8),
              ],
              SizedBox(
                width: double.infinity,
                height: 36,
                child: ElevatedButton.icon(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.brand600,
                    foregroundColor: Colors.white,
                    padding: EdgeInsets.zero,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(8)),
                  ),
                  onPressed: () => _openSheet(context),
                  icon: const Icon(Icons.description_outlined, size: 14),
                  label: const Text('검사결과지 보기',
                      style: TextStyle(
                          fontSize: 12, fontWeight: FontWeight.bold)),
                ),
              ),
            ] else
              _PendingBody(status: status, modality: modality),
          ],
        ),
      ),
    );
  }
}

// 결과 없음 상태 — 분석 중이면 로딩, 아니면 승인 대기 안내
class _PendingBody extends StatelessWidget {
  final _ModalStatus status;
  final String modality;
  const _PendingBody({required this.status, required this.modality});

  @override
  Widget build(BuildContext context) {
    final running = status == _ModalStatus.running;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 12),
      decoration: BoxDecoration(
        color: AppColors.slate50,
        border: Border.all(color: AppColors.slate200),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        children: [
          if (running)
            const SizedBox(
              width: 20,
              height: 20,
              child: CircularProgressIndicator(
                  strokeWidth: 2, color: AppColors.amber700),
            )
          else
            const Icon(Icons.hourglass_empty,
                size: 20, color: AppColors.slate400),
          const SizedBox(height: 8),
          Text(
            running ? '$modality 분석 중…' : '$modality 검사 대기',
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: AppColors.slate600),
          ),
          const SizedBox(height: 2),
          Text(
            running
                ? 'AI 모달 판독이 진행 중입니다.'
                : 'AI 분석 화면에서 권고를 승인하면 시작됩니다.',
            textAlign: TextAlign.center,
            style: const TextStyle(fontSize: 11, color: AppColors.slate400),
          ),
        ],
      ),
    );
  }
}

enum _ModalStatus { pending, running, done }

// 상태 뱃지 — padding h8/v3, radius 2, soft 색상 쌍 (emerald/amber/slate)
class _StatusBadge extends StatelessWidget {
  final _ModalStatus status;
  const _StatusBadge({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg) = switch (status) {
      _ModalStatus.done => ('완료', AppColors.emerald100, AppColors.emerald700),
      _ModalStatus.running => ('분석 중', AppColors.amber100, AppColors.amber700),
      _ModalStatus.pending => ('대기', AppColors.slate100, AppColors.slate500),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(2),
      ),
      child: Text(
        label,
        style: TextStyle(
            color: fg, fontSize: 11, fontWeight: FontWeight.bold),
      ),
    );
  }
}

// 하단 푸터 — "AI 종합소견 생성" 버튼
class _ResultsFooter extends StatelessWidget {
  final VoidCallback onGenerate;
  const _ResultsFooter({required this.onGenerate});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.slate300)),
      ),
      child: SizedBox(
        width: double.infinity,
        height: 46,
        child: ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.brand600,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8)),
          ),
          onPressed: onGenerate,
          icon: const Icon(Icons.description_outlined, size: 16),
          label: const Text('AI 종합소견 생성',
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorView({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.cloud_off, size: 48, color: AppColors.slate300),
            const SizedBox(height: 12),
            const Text('데이터 로딩 실패',
                style: TextStyle(
                    fontWeight: FontWeight.bold, color: AppColors.slate700)),
            const SizedBox(height: 4),
            Text(message,
                style: const TextStyle(
                    fontSize: 11, color: AppColors.slate500),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('재시도')),
          ],
        ),
      ),
    );
  }
}
