import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/reports_api.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/emon_top_bar.dart';

/// frontend/src/pages/v2/ReportListPage.tsx의 "종합소견서 목록"을 모바일로 적응.
/// reportsListProvider(3초 폴링)를 구독해 status로 버킷 분류 → 필터칩으로 거른 카드 목록.
/// 카드 디자인은 WorklistPage의 환자 카드 스타일을 그대로 차용
/// (Material 흰 배경 + slate-300 border + radius 4 + padding 12).
/// 행 클릭 → /patient/:encounterId/report
class ReportListPage extends ConsumerWidget {
  const ReportListPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(reportsListProvider);

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: const EmonTopBar(current: 'reports'),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _ErrorView(
          message: '$e',
          onRetry: () => ref.invalidate(reportsListProvider),
        ),
        data: (rows) => _ReportListBody(rows: rows),
      ),
    );
  }
}

/// status → 버킷 분류.
///   preliminary → 작성가능
///   reviewed    → 검토대기
///   signed/amended → 서명완료
enum _Bucket { ready, review, signed }

_Bucket _bucketOf(String status) {
  switch (status) {
    case 'signed':
    case 'amended':
      return _Bucket.signed;
    case 'reviewed':
      return _Bucket.review;
    case 'preliminary':
    default:
      return _Bucket.ready;
  }
}

/// 필터 칩 — null = 전체.
class _Chip {
  final String label;
  final _Bucket? bucket;
  const _Chip(this.label, this.bucket);
}

const _chips = <_Chip>[
  _Chip('전체', null),
  _Chip('작성 가능', _Bucket.ready),
  _Chip('검토·서명 대기', _Bucket.review),
  _Chip('서명 완료', _Bucket.signed),
];

class _ReportListBody extends StatefulWidget {
  final List<ReportData> rows;
  const _ReportListBody({required this.rows});

  @override
  State<_ReportListBody> createState() => _ReportListBodyState();
}

class _ReportListBodyState extends State<_ReportListBody> {
  _Bucket? _filter; // null = 전체

  @override
  Widget build(BuildContext context) {
    final filtered = _filter == null
        ? widget.rows
        : widget.rows
            .where((r) => _bucketOf(r.status) == _filter)
            .toList(growable: false);

    return Column(
      children: [
        // 필터 칩 (가로 스크롤)
        SizedBox(
          height: 52,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            children: [
              for (final c in _chips)
                _FilterChip(
                  label: c.label,
                  active: _filter == c.bucket,
                  onTap: () => setState(() => _filter = c.bucket),
                ),
            ],
          ),
        ),
        Expanded(
          child: filtered.isEmpty
              ? const Center(
                  child: Padding(
                    padding: EdgeInsets.all(40),
                    child: Text('조건에 맞는 소견서가 없습니다.',
                        style: TextStyle(color: AppColors.slate400)),
                  ),
                )
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: filtered.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) {
                    final r = filtered[i];
                    return _ReportCard(
                      report: r,
                      onTap: () =>
                          context.go('/patient/${r.encounterId}/report'),
                    );
                  },
                ),
        ),
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _FilterChip(
      {required this.label, required this.active, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(right: 6),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          alignment: Alignment.center,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            color: active ? AppColors.brand600 : AppColors.slate50,
            border: Border.all(
                color: active ? AppColors.brand600 : AppColors.slate200),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active ? Colors.white : AppColors.slate700,
              fontSize: 13,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  final ReportData report;
  final VoidCallback onTap;
  const _ReportCard({required this.report, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final regNo = report.subjectId ??
        (report.encounterId.length >= 8
            ? report.encounterId.substring(0, 8)
            : report.encounterId);

    return Material(
      color: Colors.white,
      shape: RoundedRectangleBorder(
        side: const BorderSide(color: AppColors.slate300),
        borderRadius: BorderRadius.circular(4),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(4),
        child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Row 1: 등록번호 + 소견서 상태 배지
              Row(
                children: [
                  Text(
                    regNo,
                    style: const TextStyle(
                      fontSize: 12,
                      color: AppColors.brand700,
                      decoration: TextDecoration.underline,
                      fontFeatures: [FontFeature.tabularFigures()],
                    ),
                  ),
                  const Spacer(),
                  _StatusBadge(bucket: _bucketOf(report.status)),
                ],
              ),
              const SizedBox(height: 8),
              // Row 2: 환자명
              Text(
                report.patientName ?? '환자명 미상',
                style: const TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    color: AppColors.slate900),
              ),
              const SizedBox(height: 6),
              // Row 3: 주증상
              Text(
                report.chiefComplaint ?? '주증상 미입력',
                style: const TextStyle(
                    fontSize: 12, color: AppColors.slate600, height: 1.4),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 10),
              // Row 4: 생성 시각 + 소견서 링크
              Row(
                children: [
                  const Icon(Icons.access_time,
                      size: 11, color: AppColors.slate400),
                  const SizedBox(width: 4),
                  Text(
                    _fmtTime(report.createdAt),
                    style: const TextStyle(
                        fontSize: 11,
                        color: AppColors.slate500,
                        fontFeatures: [FontFeature.tabularFigures()]),
                  ),
                  const Spacer(),
                  const Text(
                    '소견서',
                    style: TextStyle(
                        fontSize: 12,
                        color: AppColors.brand600,
                        fontWeight: FontWeight.bold),
                  ),
                  const Icon(Icons.chevron_right,
                      size: 16, color: AppColors.brand600),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _fmtTime(DateTime? t) {
    if (t == null) return '-';
    final local = t.toLocal();
    final hh = local.hour.toString().padLeft(2, '0');
    final mm = local.minute.toString().padLeft(2, '0');
    return '${local.month}/${local.day} $hh:$mm';
  }
}

/// 소견서 상태 배지 — soft pair.
///   작성가능 = emerald50/300/700
///   검토대기 = purple50/300/700
///   서명완료 = emerald100/400/700
class _StatusBadge extends StatelessWidget {
  final _Bucket bucket;
  const _StatusBadge({required this.bucket});

  @override
  Widget build(BuildContext context) {
    final (label, bg, border, fg) = switch (bucket) {
      _Bucket.ready => (
          '작성 가능',
          AppColors.emerald50,
          AppColors.emerald300,
          AppColors.emerald700,
        ),
      _Bucket.review => (
          '검토 대기',
          AppColors.purple50,
          AppColors.purple300,
          AppColors.purple700,
        ),
      _Bucket.signed => (
          '서명 완료',
          AppColors.emerald100,
          AppColors.emerald400,
          AppColors.emerald700,
        ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(2),
      ),
      child: Text(
        label,
        style:
            TextStyle(color: fg, fontSize: 11, fontWeight: FontWeight.bold),
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
            const Text('백엔드 연결 실패',
                style: TextStyle(
                    fontWeight: FontWeight.bold, color: AppColors.slate700)),
            const SizedBox(height: 4),
            Text(message,
                style:
                    const TextStyle(fontSize: 11, color: AppColors.slate500),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            OutlinedButton(onPressed: onRetry, child: const Text('재시도')),
          ],
        ),
      ),
    );
  }
}
