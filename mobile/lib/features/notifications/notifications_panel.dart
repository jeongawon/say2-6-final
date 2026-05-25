import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/reports_api.dart';
import '../../shared/theme/app_theme.dart';

/// FCM 푸시를 받은 의사가 알림 종을 탭하면 열리는 패널.
///   섹션 1: 미서명 소견서   (preliminary + reviewed)
///   섹션 2: Critical 환자   (ai_risk_level == 'critical')
///   섹션 3: 검사 완료·작성 가능 (preliminary)
///
/// 모달 바텀시트로 띄우면 작은 화면도 자연스럽고, 행 탭 시 /patient/{enc}로 deep link.
class NotificationsPanel extends ConsumerWidget {
  const NotificationsPanel({super.key});

  static Future<void> show(BuildContext context) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.white,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (_) => const FractionallySizedBox(
        heightFactor: 0.85,
        child: NotificationsPanel(),
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(reportsListProvider);
    return SafeArea(
      child: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('알림 로드 실패: $e')),
        data: (rows) {
          // signed/amended는 어떤 섹션에도 X
          final pending =
              rows.where((r) => r.status != 'signed' && r.status != 'amended').toList();
          // 소견서 생성 완료 · 확정 대기: preliminary (경과 시간 무관 — 항상 파랑)
          final ready =
              pending.where((r) => r.status == 'preliminary').toList();
          // 미서명 소견서: 검토했으나 아직 서명 안 함 (reviewed)
          final unsigned =
              pending.where((r) => r.status == 'reviewed').toList();
          final critical =
              pending.where((r) => r.aiRiskLevel == 'critical').toList();
          final total = unsigned.length + critical.length + ready.length;

          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // 헤더
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                decoration: const BoxDecoration(
                  color: AppColors.slate50,
                  border: Border(bottom: BorderSide(color: AppColors.slate200)),
                ),
                child: Row(
                  children: [
                    const Icon(Icons.notifications_outlined,
                        size: 20, color: AppColors.slate600),
                    const SizedBox(width: 8),
                    const Text('알림',
                        style: TextStyle(
                            fontSize: 16,
                            fontWeight: FontWeight.bold,
                            color: AppColors.slate900)),
                    const SizedBox(width: 8),
                    Text('$total건',
                        style: const TextStyle(
                            fontSize: 11,
                            color: AppColors.slate400,
                            fontFeatures: [FontFeature.tabularFigures()])),
                    const Spacer(),
                    IconButton(
                      icon: const Icon(Icons.close, color: AppColors.slate600),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: total == 0
                    ? const Center(
                        child: Text('알림이 없습니다.',
                            style: TextStyle(color: AppColors.slate400)),
                      )
                    : ListView(
                        children: [
                          _Section(
                            title: 'Critical 환자',
                            color: AppColors.critical,
                            // red-50 소프트 (critical 토큰 기반) — 토큰 팔레트에 red50 없음
                            bg: AppColors.critical.withValues(alpha: 0.08),
                            icon: Icons.warning_amber_rounded,
                            rows: critical,
                          ),
                          _Section(
                            title: '소견서 생성 완료 · 확정 대기',
                            color: AppColors.blue700,
                            bg: AppColors.blue50,
                            icon: Icons.check_circle_outline,
                            rows: ready,
                            showElapsed: true,
                          ),
                          _Section(
                            title: '미서명 소견서',
                            color: AppColors.purple700,
                            bg: AppColors.purple50,
                            icon: Icons.description_outlined,
                            rows: unsigned,
                            showElapsed: true,
                          ),
                        ],
                      ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// 미서명 5분 경과 시 빨강 강조 임계값.
const int _overdueMin = 5;

int? _elapsedMin(DateTime? d) {
  if (d == null) return null;
  final diff = DateTime.now().difference(d).inMinutes;
  return diff < 0 ? 0 : diff;
}

class _Section extends StatelessWidget {
  final String title;
  final Color color;
  final Color bg;
  final IconData icon;
  final List<ReportData> rows;
  final bool showElapsed; // 미서명 섹션만 true — 경과 시간 + 5분 초과 빨강 강조

  const _Section({
    required this.title,
    required this.color,
    required this.bg,
    required this.icon,
    required this.rows,
    this.showElapsed = false,
  });

  @override
  Widget build(BuildContext context) {
    if (rows.isEmpty) return const SizedBox.shrink();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          decoration: BoxDecoration(
            color: bg,
            border: const Border(bottom: BorderSide(color: AppColors.slate200)),
          ),
          child: Row(
            children: [
              Icon(icon, size: 16, color: color),
              const SizedBox(width: 6),
              Text(title,
                  style: TextStyle(
                      fontSize: 14, fontWeight: FontWeight.bold, color: color)),
              const Spacer(),
              Container(
                constraints: const BoxConstraints(minWidth: 20),
                padding:
                    const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: Colors.white,
                  border: Border.all(color: color.withValues(alpha: 0.35)),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text('${rows.length}',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: color,
                        fontFeatures: const [FontFeature.tabularFigures()])),
              ),
            ],
          ),
        ),
        for (final r in rows)
          _Row(report: r, showElapsed: showElapsed, accent: color),
      ],
    );
  }
}

class _Row extends StatelessWidget {
  final ReportData report;
  final bool showElapsed;
  final Color accent; // 섹션 색 — 경과 강조에 빨강 대신 사용
  const _Row(
      {required this.report, required this.showElapsed, required this.accent});

  String _fmt(DateTime? d) {
    if (d == null) return '';
    final local = d.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.month)}/${two(local.day)} ${two(local.hour)}:${two(local.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final elapsed = showElapsed ? _elapsedMin(report.createdAt) : null;
    final overdue = elapsed != null && elapsed >= _overdueMin;
    return InkWell(
      onTap: () {
        Navigator.of(context).pop();
        context.go('/patient/${report.encounterId}');
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          // 경과 강조 — 섹션 색(파랑/보라/빨강) 연한 톤
          color: overdue ? accent.withValues(alpha: 0.08) : null,
          border: Border(
            bottom: BorderSide(
                color: overdue
                    ? accent.withValues(alpha: 0.30)
                    : AppColors.slate100),
          ),
        ),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Row(
                          children: [
                            Flexible(
                              child: Text(
                                report.patientName ?? report.subjectId ?? '환자',
                                style: const TextStyle(
                                    fontSize: 14,
                                    fontWeight: FontWeight.bold,
                                    color: AppColors.slate900),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            if (report.subjectId != null) ...[
                              const SizedBox(width: 6),
                              Text('#${report.subjectId}',
                                  style: const TextStyle(
                                      fontSize: 11,
                                      color: AppColors.slate400,
                                      fontFeatures: [
                                        FontFeature.tabularFigures()
                                      ])),
                            ],
                          ],
                        ),
                      ),
                      if (elapsed != null) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: overdue
                                ? accent.withValues(alpha: 0.12)
                                : AppColors.slate100,
                            border: overdue
                                ? Border.all(
                                    color: accent.withValues(alpha: 0.35))
                                : null,
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(
                            elapsed == 0 ? '방금' : '$elapsed분 경과',
                            style: TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: overdue ? accent : AppColors.slate600,
                                fontFeatures: const [
                                  FontFeature.tabularFigures()
                                ]),
                          ),
                        ),
                      ],
                    ],
                  ),
                  if (report.chiefComplaint != null &&
                      report.chiefComplaint!.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(
                      report.chiefComplaint!,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                          fontSize: 12, color: AppColors.slate600),
                    ),
                  ],
                ],
              ),
            ),
            const SizedBox(width: 8),
            Text(_fmt(report.createdAt),
                style: const TextStyle(
                    fontSize: 11,
                    color: AppColors.slate400,
                    fontFeatures: [FontFeature.tabularFigures()])),
          ],
        ),
      ),
    );
  }
}
