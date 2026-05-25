import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/reports_api.dart';
import '../../features/notifications/notifications_panel.dart';
import '../theme/app_theme.dart';

/// 웹 AppShell 상단 네비게이션을 모바일로 이식 —
/// 보라 그라데이션 바 + EMON Med® + 가로 스크롤 탭(각 페이지) + 알림 + 로그아웃.
/// [current]: triage|worklist|analysis|results|report
/// [patientId]: 환자별 페이지(AI 분석/결과/소견서) 탭 라우팅용. 없으면 환자목록으로.
class EmonTopBar extends ConsumerWidget implements PreferredSizeWidget {
  final String current;
  final String? patientId;
  const EmonTopBar({super.key, required this.current, this.patientId});

  /// iPhone 목업(device.html, ?frame=ios)에서만 상태바 높이만큼 상단 여백 추가 —
  /// 웹 아이폰 프레임 데모에서 노치가 워드마크/탭을 가리지 않게 상단 여백.
  /// 실기기에선 0 (SafeArea가 처리). 로그인 등 EmonTopBar 미사용 페이지는 영향 없음(풀스크린).
  static double get _frameInset => kIsWeb ? 44.0 : 0.0;

  @override
  Size get preferredSize => Size.fromHeight(110 + _frameInset);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pid = patientId;
    final tabs = <(String, String, String)>[
      ('환자정보입력', '/triage', 'triage'),
      ('환자 목록', '/worklist', 'worklist'),
      ('AI 분석', pid != null ? '/patient/$pid' : '/worklist', 'analysis'),
      ('AI 결과', pid != null ? '/patient/$pid/results' : '/worklist', 'results'),
      ('AI 종합소견 생성', pid != null ? '/patient/$pid/report' : '/worklist', 'report'),
      ('운영 모니터링', '/dashboard', 'dashboard'),
    ];

    final count = ref.watch(reportsListProvider).maybeWhen(
      data: (rows) {
        int n = 0;
        for (final r in rows) {
          if (r.status == 'signed' || r.status == 'amended') continue;
          final e = r.createdAt == null
              ? null
              : DateTime.now().difference(r.createdAt!).inMinutes;
          final overdue = e != null && e >= 5;
          if (r.status == 'preliminary' && !overdue) n++;
          if ((r.status == 'preliminary' || r.status == 'reviewed') && overdue) {
            n++;
          }
          if (r.aiRiskLevel == 'critical') n++;
        }
        return n;
      },
      orElse: () => 0,
    );

    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.centerLeft,
          end: Alignment.centerRight,
          colors: [AppColors.brand700, AppColors.brand600, AppColors.aiAccent],
        ),
      ),
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_frameInset > 0) SizedBox(height: _frameInset),
            // 상단: 워드마크 + 알림 + 로그아웃
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 4, 2),
              child: Row(
                children: [
                  const Text('EMON Med®',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          letterSpacing: 0.5)),
                  const Spacer(),
                  _Bell(count: count),
                  IconButton(
                    icon: const Icon(Icons.logout, color: Colors.white, size: 20),
                    tooltip: '로그아웃',
                    onPressed: () => context.go('/'),
                  ),
                ],
              ),
            ),
            // 탭 (가로 스크롤)
            SizedBox(
              height: 38,
              child: ListView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                children: [
                  for (final (label, route, key) in tabs)
                    _Tab(
                      label: label,
                      active: key == current,
                      onTap: () => context.go(route),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

class _Tab extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _Tab({required this.label, required this.active, required this.onTap});

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
            color: active ? Colors.white : Colors.white.withValues(alpha: 0.14),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Text(
            label,
            style: TextStyle(
              color: active
                  ? AppColors.brand700
                  : Colors.white.withValues(alpha: 0.92),
              fontSize: 13,
              fontWeight: FontWeight.bold,
            ),
          ),
        ),
      ),
    );
  }
}

class _Bell extends StatelessWidget {
  final int count;
  const _Bell({required this.count});

  @override
  Widget build(BuildContext context) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        IconButton(
          icon: const Icon(Icons.notifications_outlined,
              color: Colors.white, size: 22),
          onPressed: () => NotificationsPanel.show(context),
        ),
        if (count > 0)
          Positioned(
            top: 6,
            right: 6,
            child: Container(
              constraints: const BoxConstraints(minWidth: 16, minHeight: 16),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              decoration: BoxDecoration(
                color: AppColors.critical,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('$count',
                  textAlign: TextAlign.center,
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 10,
                      fontWeight: FontWeight.bold)),
            ),
          ),
      ],
    );
  }
}
