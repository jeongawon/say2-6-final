import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/patient_api.dart';
import '../../core/models/ai_rec.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/emon_top_bar.dart';
import '../../shared/widgets/live_badge.dart';
import '../../shared/widgets/top_notification_banner.dart';
import 'cxr_clinical_sheet.dart';
import 'ecg_clinical_sheet.dart';
import 'lab_clinical_sheet.dart';

/// frontend/src/pages/v2/PatientDetailPage.tsx의 AIRecPanel(가운데 컬럼)을 모바일에 맞춤.
/// 헤더(AI 검사 권고) + 진행 요약 + 1·2·3차 권고 그룹 + 의사 직접 오더 그룹
/// + 모든 권고 완료 안내 + footer "종합 소견서 생성" 버튼.
class PatientDetailPage extends ConsumerWidget {
  final String patientId; // encounter_id
  const PatientDetailPage({super.key, required this.patientId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(patientDetailProvider(patientId));

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: EmonTopBar(current: 'analysis', patientId: patientId),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(
          message: '$e',
          onRetry: () => ref.invalidate(patientDetailProvider),
        ),
        data: (data) {
          final aiRecs = data.recommendations.where((r) => !r.isManual).toList();
          final manualRecs =
              data.recommendations.where((r) => r.isManual).toList();
          final allDraft = data.recommendations
              .where((r) => r.status == 'draft')
              .toList();
          final doneCount = data.recommendations
              .where((r) => r.status == 'completed')
              .length;
          final allDone = data.recommendations.isNotEmpty &&
              data.recommendations.every((r) => r.status == 'completed');

          // AI 권고 1·2·3차 그룹 — 시간 클러스터링 (5초 이상 갭마다 차수+1)
          final byRank = <int, List<AIRec>>{};
          int rank = 1;
          DateTime? prev;
          for (final r in aiRecs) {
            if (prev != null && r.authoredOn.difference(prev).inSeconds > 5) {
              rank = (rank + 1).clamp(1, 3);
            }
            byRank.putIfAbsent(rank, () => []).add(r);
            prev = r.authoredOn;
          }
          final ranks = byRank.keys.toList()..sort();

          return Column(
            children: [
              Expanded(
                child: RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(patientDetailProvider),
                  child: ListView(
                    padding: const EdgeInsets.all(12),
                    children: [
                      _PanelHeader(patientId: patientId),
                      const SizedBox(height: 10),
                      if (data.recommendations.isEmpty)
                        const _LoadingCard()
                      else ...[
                        // AI 1·2·3차 권고
                        for (final r in ranks) ...[
                          _RankGroup(
                            rank: r,
                            recs: byRank[r]!,
                            encounterId: patientId,
                            modalResults: data.modalResults,
                            patient: data.patient,
                          ),
                          const SizedBox(height: 10),
                        ],
                        // 의사 직접 오더 그룹
                        if (manualRecs.isNotEmpty) ...[
                          _ManualOrderGroup(
                            recs: manualRecs,
                            encounterId: patientId,
                            modalResults: data.modalResults,
                            patient: data.patient,
                          ),
                          const SizedBox(height: 10),
                        ],
                        // 모든 권고 완료 안내
                        if (allDone) const _AllDoneNotice(),
                      ],
                      const SizedBox(height: 12),
                      // 검사 직접 오더 — ECG/CXR/LAB 3개 버튼 (AI 권고와 무관)
                      _DirectOrderPanel(
                        encounterId: patientId,
                        patient: data.patient,
                        recommendations: data.recommendations,
                        modalResults: data.modalResults,
                      ),
                    ],
                  ),
                ),
              ),
              _PanelFooter(
                disabled: doneCount == 0,
                onOpenReport: () =>
                    context.go('/patient/$patientId/results'),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// 패널 헤더 — 웹 PanelHeader: brand-50 bg + sparkles 아이콘
// ────────────────────────────────────────────────────────────
class _PanelHeader extends ConsumerWidget {
  final String patientId;
  const _PanelHeader({required this.patientId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // 백엔드 연결 유무 → LIVE / 연결 중 / 오프라인 (웹 wsStatus 대응)
    final status = ref.watch(patientDetailProvider(patientId)).when(
          data: (_) => LiveStatus.live,
          loading: () => LiveStatus.connecting,
          error: (_, _) => LiveStatus.offline,
        );
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: AppColors.brand50,
        border: Border.all(color: AppColors.brand200),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        children: [
          const Icon(Icons.auto_awesome,
              color: AppColors.brand600, size: 20),
          const SizedBox(width: 8),
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'AI 검사 권고',
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.bold,
                    color: AppColors.slate900),
              ),
              SizedBox(height: 2),
              Text(
                'AI RECOMMENDATIONS · 1·2·3차',
                style: TextStyle(
                  fontSize: 10,
                  color: AppColors.slate400,
                  letterSpacing: 1.2,
                ),
              ),
            ],
          ),
          const Spacer(),
          LiveBadge(status: status),
        ],
      ),
    );
  }
}

// 진행 요약 + 모두 승인 버튼 — 웹과 동일
class _ProgressSummary extends StatelessWidget {
  final int totalAi;
  final int totalManual;
  final int done;
  final int draft;
  final VoidCallback? onApproveAll;
  const _ProgressSummary({
    required this.totalAi,
    required this.totalManual,
    required this.done,
    required this.draft,
    required this.onApproveAll,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate300),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        children: [
          Expanded(
            child: DefaultTextStyle(
              style: const TextStyle(
                  fontSize: 12,
                  color: AppColors.slate600,
                  fontFeatures: [FontFeature.tabularFigures()]),
              child: Wrap(
                spacing: 4,
                children: [
                  Text.rich(TextSpan(children: [
                    const TextSpan(text: 'AI '),
                    TextSpan(
                      text: '$totalAi',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.slate900),
                    ),
                    const TextSpan(text: ' · 의사 '),
                    TextSpan(
                      text: '$totalManual',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.slate900),
                    ),
                    const TextSpan(text: ' · 완료 '),
                    TextSpan(
                      text: '$done',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.emerald600),
                    ),
                    const TextSpan(text: ' · 미승인 '),
                    TextSpan(
                      text: '$draft',
                      style: const TextStyle(
                          fontWeight: FontWeight.bold,
                          color: AppColors.purple600),
                    ),
                  ])),
                ],
              ),
            ),
          ),
          if (onApproveAll != null)
            SizedBox(
              height: 28,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.brand600,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(horizontal: 10),
                  minimumSize: Size.zero,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: onApproveAll,
                child: Text(
                  '모두 승인 ($draft)',
                  style: const TextStyle(
                      fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// AI 1·2·3차 권고 그룹 — 웹 RANK_META 색상
class _RankGroup extends StatelessWidget {
  final int rank;
  final List<AIRec> recs;
  final String encounterId;
  final Map<String, ModalSummary> modalResults;
  final PatientInfo patient;
  const _RankGroup({
    required this.rank,
    required this.recs,
    required this.encounterId,
    required this.modalResults,
    required this.patient,
  });

  @override
  Widget build(BuildContext context) {
    final meta = RankMeta.of(rank);
    return Container(
      decoration: BoxDecoration(
        color: meta.barBg,
        border: Border.all(color: meta.barBorder),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // 그룹 헤더
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(
                  bottom: BorderSide(color: AppColors.slate200)),
            ),
            child: Row(
              children: [
                const Icon(Icons.auto_awesome,
                    size: 12, color: AppColors.brand600),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: meta.badgeBg,
                    borderRadius: BorderRadius.circular(2),
                  ),
                  child: Text(
                    meta.label,
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  'AI 분석 기반 · 검사 ${recs.length}건',
                  style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w500,
                      color: AppColors.slate500,
                      fontFeatures: [FontFeature.tabularFigures()]),
                ),
              ],
            ),
          ),
          // 권고 카드들
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(10),
            child: Column(
              children: [
                for (int i = 0; i < recs.length; i++) ...[
                  if (i > 0) const SizedBox(height: 8),
                  _RecCard(
                    rec: recs[i],
                    encounterId: encounterId,
                    patient: patient,
                    modal: modalResults[recs[i].modality],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// 검사 직접 오더 패널 — ECG / CXR / LAB 3개 버튼 항상 표시
// 웹 PatientDetailPage.tsx 의 ManualOrderPanel 과 동일 디자인.
// AI 권고와 무관하게 의사가 즉시 모달 실행 트리거 가능.
class _DirectOrderPanel extends ConsumerStatefulWidget {
  final String encounterId;
  final PatientInfo patient;
  final List<AIRec> recommendations;
  final Map<String, ModalSummary> modalResults;
  const _DirectOrderPanel({
    required this.encounterId,
    required this.patient,
    required this.recommendations,
    required this.modalResults,
  });

  @override
  ConsumerState<_DirectOrderPanel> createState() => _DirectOrderPanelState();
}

class _DirectOrderPanelState extends ConsumerState<_DirectOrderPanel> {
  final Set<String> _requesting = {}; // 5초간 로딩 표시용
  final Set<String> _requested = {};  // 클릭 즉시 영구 마킹
  // 모달 추론 서버 ON/OFF (목업 — 배포 후 /ops/health 연동). 칩 탭으로 토글.
  final Map<String, bool> _servers = {'ECG': true, 'CXR': true, 'LAB': true};
  final Set<String> _manualDone = {}; // 추론 서버 OFF 시 수기 입력 완료
  final _memoCtrl = TextEditingController(); // 의사 메모 (자동 저장 — 데모)

  @override
  void dispose() {
    _memoCtrl.dispose();
    super.dispose();
  }

  Future<void> _request(String modality) async {
    setState(() {
      _requested.add(modality);
      _requesting.add(modality);
    });
    try {
      await requestOrder(
        ref,
        encounterId: widget.encounterId,
        patientId: widget.patient.subjectId ?? widget.encounterId,
        modality: modality,
      );
      if (!mounted) return;
      TopNotificationBanner.show(context,
          title: '$modality 직접 오더 — 분석 시작',
          duration: const Duration(seconds: 2));
    } catch (e) {
      if (!mounted) return;
      TopNotificationBanner.show(context,
          title: '오더 실패', body: '$e', critical: true);
      setState(() => _requested.remove(modality));
    } finally {
      if (mounted) {
        Future.delayed(const Duration(seconds: 5), () {
          if (mounted) setState(() => _requesting.remove(modality));
        });
      }
    }
  }

  // 해당 modality의 기존 AI 권고/오더 (있으면 그 상태를 표시)
  AIRec? _recFor(String modality) {
    for (final r in widget.recommendations) {
      if (r.modality == modality) return r;
    }
    return null;
  }

  // 추론 서버 OFF 시 — 의사 수기 입력 (웹 ManualInputModal 대응, 간소화).
  Future<void> _openManualInput(String modality) async {
    final ctrl = TextEditingController();
    final saved = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('$modality 수기 입력',
            style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('추론 서버 OFF — 의사가 판독 결과를 직접 기록합니다.',
                style: TextStyle(fontSize: 12, color: AppColors.slate500)),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              maxLines: 4,
              decoration: InputDecoration(
                hintText: '판독 소견 입력…',
                border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(8)),
                contentPadding: const EdgeInsets.all(12),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('취소')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.brand600,
                foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('저장'),
          ),
        ],
      ),
    );
    if (saved == true && mounted) {
      setState(() => _manualDone.add(modality));
      TopNotificationBanner.show(context,
          title: '$modality 수기 입력 완료 (데모)',
          duration: const Duration(seconds: 2));
    }
  }

  @override
  Widget build(BuildContext context) {
    const all = ['ECG', 'CXR', 'LAB'];
    final anyDown = all.any((m) => !(_servers[m] ?? true));
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate300),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              border: Border(bottom: BorderSide(color: AppColors.slate200)),
            ),
            child: Row(
              children: [
                Container(
                  width: 28,
                  height: 28,
                  decoration: BoxDecoration(
                    color: AppColors.slate700,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: const Icon(Icons.medical_services_outlined,
                      size: 15, color: Colors.white),
                ),
                const SizedBox(width: 8),
                const Text('의사 직접 지시',
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: AppColors.slate900)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Column(
              children: [
                if (anyDown) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: AppColors.amber50,
                      border: Border.all(color: AppColors.amber300),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Row(
                      children: [
                        Icon(Icons.wifi_off,
                            size: 14, color: AppColors.amber700),
                        SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            '추론 서버가 꺼진 검사는 의사가 직접 입력할 수 있습니다.',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                                color: AppColors.amber700),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 8),
                ],
                for (int i = 0; i < all.length; i++) ...[
                  if (i > 0) const SizedBox(height: 8),
                  _buildRow(all[i]),
                ],
                const SizedBox(height: 14),
                // 의사 메모 — 웹 ManualOrderPanel 메모칸과 동일
                Row(
                  children: [
                    const Icon(Icons.edit_outlined,
                        size: 15, color: AppColors.slate500),
                    const SizedBox(width: 5),
                    const Text('의사 메모',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.bold,
                            color: AppColors.slate800)),
                    const Spacer(),
                    const Text('자동 저장',
                        style:
                            TextStyle(fontSize: 11, color: AppColors.slate400)),
                  ],
                ),
                const SizedBox(height: 6),
                TextField(
                  controller: _memoCtrl,
                  maxLines: 4,
                  style: const TextStyle(fontSize: 13),
                  decoration: InputDecoration(
                    hintText: '처치 경과 · 인계사항 · 환자 특이사항을 입력하세요',
                    hintStyle: const TextStyle(
                        fontSize: 13, color: AppColors.slate400),
                    isDense: true,
                    contentPadding: const EdgeInsets.all(10),
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(6),
                      borderSide:
                          const BorderSide(color: AppColors.slate200),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(6),
                      borderSide:
                          const BorderSide(color: AppColors.slate200),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRow(String modality) {
    final rec = _recFor(modality);
    final serverUp = _servers[modality] ?? true;
    final manualDone = _manualDone.contains(modality);
    final loading = _requesting.contains(modality);
    final requested = _requested.contains(modality);
    final done = rec?.isDone ?? false;
    final running = rec?.isRunning ?? false;
    final requesting = loading || (requested && rec == null);
    final ordered = rec != null || requested;

    final IconData icon = switch (modality) {
      'ECG' => Icons.monitor_heart_outlined,
      'CXR' => Icons.image_outlined,
      _ => Icons.science_outlined,
    };
    final String label = switch (modality) {
      'ECG' => '심전도 12-Lead',
      'CXR' => '흉부 X-ray',
      _ => '혈액 검사',
    };

    final (cardBg, cardBorder) = manualDone
        ? (AppColors.emerald50, AppColors.emerald300)
        : !serverUp
            ? (AppColors.critical.withAlpha(20), AppColors.critical.withAlpha(90))
            : (Colors.white, AppColors.slate200);

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: cardBg,
        border: Border.all(color: cardBorder),
        borderRadius: BorderRadius.circular(4),
      ),
      // 직렬(인라인): 아이콘 + 이름·라벨 + 활성/비활성 칩 + 검사 지시 버튼
      child: Row(
        children: [
          Container(
            width: 28,
            height: 28,
            decoration: BoxDecoration(
              color: AppColors.slate100,
              borderRadius: BorderRadius.circular(4),
            ),
            child: Icon(icon, size: 14, color: AppColors.slate600),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.baseline,
              textBaseline: TextBaseline.alphabetic,
              children: [
                Text(modality,
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.bold,
                        color: AppColors.slate900)),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(label,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 11, color: AppColors.slate400)),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          _ServerChip(
            up: serverUp,
            onTap: () => setState(() => _servers[modality] = !serverUp),
          ),
          const SizedBox(width: 6),
          _action(
            modality,
            serverUp: serverUp,
            manualDone: manualDone,
            done: done,
            running: running,
            requesting: requesting,
            ordered: ordered,
          ),
        ],
      ),
    );
  }

  Widget _action(
    String modality, {
    required bool serverUp,
    required bool manualDone,
    required bool done,
    required bool running,
    required bool requesting,
    required bool ordered,
  }) {
    Widget chip(String text, Color bg, Color fg, {Widget? leading}) => Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
              color: bg, borderRadius: BorderRadius.circular(4)),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (leading != null) ...[leading, const SizedBox(width: 4)],
              Text(text,
                  style: TextStyle(
                      fontSize: 11, fontWeight: FontWeight.bold, color: fg)),
            ],
          ),
        );

    if (manualDone) {
      return _ActionButton(
        label: '수기 입력 완료 · 수정',
        icon: Icons.check_circle,
        bg: AppColors.emerald100,
        fg: AppColors.emerald700,
        onTap: () => _openManualInput(modality),
      );
    }
    if (!serverUp) {
      return _ActionButton(
        label: '직접 입력',
        icon: Icons.edit_outlined,
        bg: AppColors.slate800,
        fg: Colors.white,
        onTap: () => _openManualInput(modality),
      );
    }
    if (done) {
      return chip('✓ 완료', AppColors.emerald100, AppColors.emerald700);
    }
    if (running || requesting) {
      return chip(
        running ? '분석 중' : '요청 중',
        AppColors.amber100,
        AppColors.amber700,
        leading: const SizedBox(
          width: 11,
          height: 11,
          child: CircularProgressIndicator(
              strokeWidth: 2, color: AppColors.amber700),
        ),
      );
    }
    if (ordered) {
      return chip('지시됨', AppColors.slate100, AppColors.slate400);
    }
    return _ActionButton(
      label: '검사 지시',
      icon: Icons.medical_services_outlined,
      bg: Colors.white,
      fg: AppColors.slate700,
      border: AppColors.slate400,
      onTap: () => _request(modality),
    );
  }
}

// 모달 추론 서버 ON/OFF 칩 — 웹 ManualOrderRow 의 서버 상태 버튼 대응. 탭하면 토글.
class _ServerChip extends StatelessWidget {
  final bool up;
  final VoidCallback onTap;
  const _ServerChip({required this.up, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final (bg, border, fg) = up
        ? (AppColors.emerald50, AppColors.emerald300, AppColors.emerald700)
        : (AppColors.slate100, AppColors.slate200, AppColors.slate500);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Tooltip(
        message: '추론 서버 상태 (탭해서 ON/OFF 전환)',
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
          decoration: BoxDecoration(
            color: bg,
            border: Border.all(color: border),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(up ? Icons.wifi : Icons.wifi_off, size: 12, color: fg),
              const SizedBox(width: 4),
              Text(up ? '활성' : '비활성',
                  style: TextStyle(
                      fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
            ],
          ),
        ),
      ),
    );
  }
}

// 직접 오더 / 직접 입력 액션 버튼
class _ActionButton extends StatelessWidget {
  final String label;
  final IconData icon;
  final Color bg;
  final Color fg;
  final Color? border;
  final VoidCallback onTap;
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.bg,
    required this.fg,
    required this.onTap,
    this.border,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        // '활성' 칩과 동일 크기 — 높이 고정 제거, 패딩/아이콘/글씨 칩에 맞춤
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
        decoration: BoxDecoration(
          color: bg,
          border: border != null ? Border.all(color: border!) : null,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 12, color: fg),
            const SizedBox(width: 4),
            Text(label,
                style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.bold, color: fg)),
          ],
        ),
      ),
    );
  }
}

// 의사 직접 오더 그룹 — slate 톤 (이미 만들어진 manual SR 카드 — _DirectOrderPanel과는 별개)
class _ManualOrderGroup extends StatelessWidget {
  final List<AIRec> recs;
  final String encounterId;
  final Map<String, ModalSummary> modalResults;
  final PatientInfo patient;
  const _ManualOrderGroup({
    required this.recs,
    required this.encounterId,
    required this.modalResults,
    required this.patient,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate300),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: const BoxDecoration(
              color: AppColors.slate100,
              border: Border(
                  bottom: BorderSide(color: AppColors.slate300)),
            ),
            child: Row(
              children: [
                const Icon(Icons.medical_services,
                    size: 14, color: AppColors.slate700),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                      color: AppColors.slate700,
                      borderRadius: BorderRadius.circular(2)),
                  child: const Text(
                    '의사 직접 오더',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 11,
                        fontWeight: FontWeight.bold),
                  ),
                ),
                const SizedBox(width: 8),
                Text('AI 권고와 무관 · 의사 판단 · 검사 ${recs.length}건',
                    style: const TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.w500,
                        color: AppColors.slate500,
                        fontFeatures: [FontFeature.tabularFigures()])),
              ],
            ),
          ),
          Container(
            color: Colors.white,
            padding: const EdgeInsets.all(10),
            child: Column(
              children: [
                for (int i = 0; i < recs.length; i++) ...[
                  if (i > 0) const SizedBox(height: 8),
                  _RecCard(
                    rec: recs[i],
                    encounterId: encounterId,
                    manual: true,
                    patient: patient,
                    modal: modalResults[recs[i].modality],
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// 개별 권고 카드 — 웹 RecRow와 동일 디자인
class _RecCard extends ConsumerStatefulWidget {
  final AIRec rec;
  final String encounterId;
  final bool manual;
  final ModalSummary? modal; // 해당 모달의 raw 결과 (검사결과지 버튼이 사용)
  final PatientInfo patient; // 인적사항 + subject_id (검사결과지 헤더 + CXR 이미지용)
  const _RecCard({
    required this.rec,
    required this.encounterId,
    required this.patient,
    this.manual = false,
    this.modal,
  });

  @override
  ConsumerState<_RecCard> createState() => _RecCardState();
}

class _RecCardState extends ConsumerState<_RecCard> {
  bool _approving = false;

  Future<void> _approve() async {
    setState(() => _approving = true);
    try {
      await approveOrder(ref, widget.rec.srId, widget.encounterId);
      if (!mounted) return;
      TopNotificationBanner.show(context,
          title: '${widget.rec.modality} 검사 승인 — 분석 시작',
          duration: const Duration(seconds: 2));
    } catch (e) {
      if (!mounted) return;
      TopNotificationBanner.show(context,
          title: '승인 실패', body: '$e', critical: true);
    } finally {
      if (mounted) setState(() => _approving = false);
    }
  }

  IconData _icon(String m) => switch (m) {
        'ECG' => Icons.monitor_heart_outlined,
        'CXR' => Icons.image_outlined,
        _ => Icons.science_outlined,
      };

  String _label(String m) => switch (m) {
        'ECG' => '심전도 12-Lead',
        'CXR' => '흉부 X-ray',
        _ => '혈액 검사',
      };

  @override
  Widget build(BuildContext context) {
    final r = widget.rec;
    final isDone = r.isDone;
    final isRunning = _approving || r.isRunning;
    final isDraft = r.isDraft && !_approving;

    final (cardBg, cardBorder) = switch ((isDone, isRunning, widget.manual)) {
      (true, _, _) => (
        AppColors.emerald50.withAlpha(100),
        AppColors.emerald300.withAlpha(140),
      ),
      (_, true, _) => (
        AppColors.amber50.withAlpha(100),
        AppColors.amber300.withAlpha(140),
      ),
      (_, _, true) => (
        AppColors.slate50.withAlpha(160),
        AppColors.slate300,
      ),
      _ => (Colors.white, AppColors.slate200),
    };

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: cardBg,
        border: Border.all(color: cardBorder),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 28,
                height: 28,
                decoration: BoxDecoration(
                  color: isDone
                      ? AppColors.emerald100
                      : isRunning
                          ? AppColors.amber100
                          : widget.manual
                              ? AppColors.slate200
                              : AppColors.slate100,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Icon(
                  _icon(r.modality),
                  size: 14,
                  color: isDone
                      ? AppColors.emerald700
                      : isRunning
                          ? AppColors.amber700
                          : AppColors.slate600,
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(r.modality,
                      style: const TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.bold,
                          color: AppColors.slate900,
                          height: 1)),
                  const SizedBox(height: 2),
                  Text(_label(r.modality),
                      style: const TextStyle(
                          fontSize: 10, color: AppColors.slate400)),
                ],
              ),
              const Spacer(),
              _RecStatusChip(isDone: isDone, isRunning: isRunning),
            ],
          ),
          if (r.reason.isNotEmpty) ...[
            const SizedBox(height: 6),
            Text(
              r.reason,
              style: const TextStyle(
                  fontSize: 11,
                  color: AppColors.slate500,
                  height: 1.4),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
          if (isDraft) ...[
            const SizedBox(height: 8),
            SizedBox(
              width: double.infinity,
              height: 32,
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.slate800,
                  foregroundColor: Colors.white,
                  padding: EdgeInsets.zero,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: _approve,
                icon: const Icon(Icons.check_circle, size: 14),
                label: const Text('검사 실행',
                    style: TextStyle(
                        fontSize: 11, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
          // 검사결과지 보기는 'AI 결과' 페이지에서만 — 분석 페이지는 완료 상태만 표시.
        ],
      ),
    );
  }
}

class _RecStatusChip extends StatelessWidget {
  final bool isDone;
  final bool isRunning;
  const _RecStatusChip({required this.isDone, required this.isRunning});

  @override
  Widget build(BuildContext context) {
    final (label, bg, border, fg, icon) = isDone
        ? ('완료', AppColors.emerald50, AppColors.emerald300,
            AppColors.emerald700, Icons.check_circle)
        : isRunning
            ? ('분석 중', AppColors.amber100, AppColors.amber400,
                AppColors.amber700, Icons.refresh)
            : ('승인 대기', AppColors.purple50, AppColors.purple300,
                AppColors.purple700, null);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(2)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 10, color: fg),
            const SizedBox(width: 3),
          ],
          Text(label,
              style: TextStyle(
                  color: fg,
                  fontSize: 11,
                  fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

// 모든 권고 완료 안내
class _AllDoneNotice extends StatelessWidget {
  const _AllDoneNotice();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.emerald50,
        border: Border.all(color: AppColors.emerald300),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle,
              color: AppColors.emerald600, size: 18),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: const [
                Text('모든 권장 검사 완료',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppColors.emerald800)),
                SizedBox(height: 2),
                Text(
                  'AI가 추가로 권고하는 검사가 없습니다. 종합 소견서를 생성할 수 있습니다.',
                  style: TextStyle(
                      fontSize: 11,
                      color: AppColors.emerald700,
                      height: 1.4),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// 모달 결과 섹션 — 완료된 각 모달마다 "검사결과지" 버튼 (풀시트 다이얼로그 열기)
// 웹 PatientDetailPage 검사결과 탭과 동일 패턴.
class _ModalResultsSection extends StatelessWidget {
  final Map<String, ModalSummary> modalResults;
  final PatientInfo patient;
  const _ModalResultsSection({
    required this.modalResults,
    required this.patient,
  });

  void _openSheet(BuildContext context, ModalSummary m) {
    final patientName = patient.name ?? '환자';
    final age = patient.age ?? 0;
    final sex = patient.sex;
    final patientId = patient.subjectId ?? '';

    if (m.modality == 'ECG') {
      showEcgClinicalSheet(
        context,
        patientName: patientName,
        age: age,
        sex: sex,
        patientId: patientId,
        waveform: m.ecgWaveform,
        ecgVitals: m.ecgVitals,
        findings: m.findings,
      );
    } else if (m.modality == 'CXR') {
      showCxrClinicalSheet(
        context,
        patientName: patientName,
        age: age,
        sex: sex,
        patientId: patientId,
        subjectId: patient.subjectId,
        measurements: m.cxrMeasurements,
        metadata: m.cxrMetadata,
        findingsText: m.cxrFindingsText,
        impression: m.cxrImpression,
        summary: m.summary,
        riskLevel: m.riskLevel,
      );
    } else if (m.modality == 'LAB') {
      showLabClinicalSheet(
        context,
        patientName: patientName,
        age: age,
        sex: sex,
        patientId: patientId,
        labSummary: m.labSummary,
        prognosis6h: m.prognosis6h,
        summary: m.summary,
        riskLevel: m.riskLevel,
      );
    }
  }

  IconData _icon(String modality) => switch (modality) {
        'ECG' => Icons.monitor_heart_outlined,
        'CXR' => Icons.image_outlined,
        _ => Icons.science_outlined,
      };

  String _label(String modality) => switch (modality) {
        'ECG' => '심전도 12-Lead',
        'CXR' => '흉부 X-ray',
        _ => '혈액 검사',
      };

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          child: Row(
            children: const [
              Icon(Icons.science_outlined,
                  size: 14, color: AppColors.slate600),
              SizedBox(width: 6),
              Text('검사 결과',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: AppColors.slate900)),
            ],
          ),
        ),
        if (modalResults.isEmpty)
          Container(
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
                color: Colors.white,
                border: Border.all(color: AppColors.slate300),
                borderRadius: BorderRadius.circular(4)),
            child: const Text(
              '아직 완료된 검사 없음',
              style: TextStyle(fontSize: 11, color: AppColors.slate500),
            ),
          )
        else
          for (final m in modalResults.values) ...[
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: AppColors.slate300),
                  borderRadius: BorderRadius.circular(4)),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // 상단 — modality 뱃지 + 라벨 + 검사결과지 버튼
                  Padding(
                    padding: const EdgeInsets.fromLTRB(10, 10, 10, 6),
                    child: Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: m.isDone
                                ? AppColors.emerald600
                                : AppColors.slate500,
                            borderRadius: BorderRadius.circular(2),
                          ),
                          child: Text(m.modality,
                              style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.bold)),
                        ),
                        const SizedBox(width: 8),
                        Icon(_icon(m.modality),
                            size: 14, color: AppColors.slate600),
                        const SizedBox(width: 4),
                        Expanded(
                          child: Text(
                            _label(m.modality),
                            style: const TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate900),
                          ),
                        ),
                        if (m.isDone)
                          TextButton.icon(
                            onPressed: () => _openSheet(context, m),
                            style: TextButton.styleFrom(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              minimumSize: Size.zero,
                              tapTargetSize:
                                  MaterialTapTargetSize.shrinkWrap,
                              foregroundColor: AppColors.vunoCyanDim,
                              side: const BorderSide(
                                  color: AppColors.vunoCyanDim),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(8)),
                            ),
                            icon: const Icon(Icons.description_outlined,
                                size: 12),
                            label: const Text('검사결과지',
                                style: TextStyle(
                                    fontSize: 10,
                                    fontWeight: FontWeight.bold)),
                          ),
                      ],
                    ),
                  ),
                  // 하단 — 한 줄 요약
                  Padding(
                    padding:
                        const EdgeInsets.fromLTRB(10, 0, 10, 10),
                    child: Text(
                      m.summary ?? '결과 없음',
                      style: const TextStyle(
                          fontSize: 12,
                          color: AppColors.slate600,
                          height: 1.4),
                    ),
                  ),
                ],
              ),
            ),
          ],
      ],
    );
  }
}

// 하단 "종합 소견서 생성" 버튼 — 웹 PanelFooter
class _PanelFooter extends StatelessWidget {
  final bool disabled;
  final VoidCallback onOpenReport;
  const _PanelFooter({required this.disabled, required this.onOpenReport});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.slate200)),
      ),
      child: Column(
        children: [
          SizedBox(
            width: double.infinity,
            height: 46,
            child: ElevatedButton.icon(
              style: ElevatedButton.styleFrom(
                backgroundColor:
                    disabled ? AppColors.slate200 : AppColors.brand600,
                foregroundColor:
                    disabled ? AppColors.slate400 : Colors.white,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: disabled ? null : onOpenReport,
              icon: const Icon(Icons.chevron_right, size: 18),
              label: Text(
                disabled ? '검사 진행 중 — 결과 대기' : 'AI 결과 보기',
                style: const TextStyle(
                    fontSize: 15, fontWeight: FontWeight.bold),
              ),
            ),
          ),
          if (disabled) ...[
            const SizedBox(height: 6),
            SizedBox(
              width: double.infinity,
              height: 32,
              child: OutlinedButton(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.slate600,
                  side: const BorderSide(color: AppColors.slate300),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(8)),
                ),
                onPressed: onOpenReport,
                child: const Text('의사 직권으로 소견서 생성 →',
                    style: TextStyle(
                        fontSize: 11, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _LoadingCard extends StatelessWidget {
  const _LoadingCard();
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(24),
      alignment: Alignment.center,
      child: Column(
        children: const [
          CircularProgressIndicator(strokeWidth: 2),
          SizedBox(height: 10),
          Text('AI 권고를 불러오는 중…',
              style: TextStyle(fontSize: 11, color: AppColors.slate500)),
        ],
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
            const Icon(Icons.cloud_off,
                size: 48, color: AppColors.slate300),
            const SizedBox(height: 12),
            const Text('데이터 로딩 실패',
                style: TextStyle(
                    fontWeight: FontWeight.bold,
                    color: AppColors.slate700)),
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
