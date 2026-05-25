import 'dart:async';

import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// 포그라운드 상태에서 FCM 푸시를 받으면 화면 상단에서 슬라이드 다운으로 표시되는 배너.
///
/// 사용:
///   TopNotificationBanner.show(
///     context,
///     title: 'critical 폐부종 소견',
///     body: '양OO #18230098',
///     critical: true,
///     onTap: () => context.go('/patient/[enc]'),
///   );
///
/// 동작: 상단에 4초 슬라이드 다운 → 자동 dismiss. 탭하면 즉시 dismiss + onTap 호출.
/// 위치/Z-order: OverlayEntry 사용 — 어떤 페이지 위에도 떠 있음.
class TopNotificationBanner {
  static OverlayEntry? _current;
  static Timer? _autoDismiss;

  static void show(
    BuildContext context, {
    required String title,
    String? body,
    bool critical = false,
    VoidCallback? onTap,
    Duration duration = const Duration(seconds: 5),
  }) {
    _dismiss();
    final overlay = Overlay.of(context, rootOverlay: true);
    late OverlayEntry entry;
    entry = OverlayEntry(
      builder: (_) => _Banner(
        title: title,
        body: body,
        critical: critical,
        onTap: () {
          _dismiss();
          onTap?.call();
        },
        onClose: _dismiss,
      ),
    );
    _current = entry;
    overlay.insert(entry);
    _autoDismiss = Timer(duration, _dismiss);
  }

  static void _dismiss() {
    _autoDismiss?.cancel();
    _autoDismiss = null;
    _current?.remove();
    _current = null;
  }
}

class _Banner extends StatefulWidget {
  final String title;
  final String? body;
  final bool critical;
  final VoidCallback onTap;
  final VoidCallback onClose;
  const _Banner({
    required this.title,
    required this.body,
    required this.critical,
    required this.onTap,
    required this.onClose,
  });

  @override
  State<_Banner> createState() => _BannerState();
}

class _BannerState extends State<_Banner>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 280),
  )..forward();
  late final Animation<Offset> _slide = Tween<Offset>(
    begin: const Offset(0, -1.2),
    end: Offset.zero,
  ).animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // 비-critical 토스트는 앰버(노랑) — 보라색 상단 네비게이션 위로 떠도 잘 보이게.
    final bg = widget.critical ? AppColors.critical : AppColors.amber600;
    return Positioned(
      top: 0,
      left: 0,
      right: 0,
      child: SafeArea(
        bottom: false,
        child: SlideTransition(
          position: _slide,
          child: Material(
            color: Colors.transparent,
            child: Container(
              margin: const EdgeInsets.fromLTRB(8, 8, 8, 0),
              decoration: BoxDecoration(
                color: bg,
                borderRadius: BorderRadius.circular(8),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: 0.20),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: InkWell(
                onTap: widget.onTap,
                borderRadius: BorderRadius.circular(8),
                child: Padding(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 12),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        widget.critical
                            ? Icons.warning_amber_rounded
                            : Icons.notifications_active_outlined,
                        color: Colors.white,
                        size: 22,
                      ),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              widget.title,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 14,
                                fontWeight: FontWeight.bold,
                              ),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                            if (widget.body != null &&
                                widget.body!.isNotEmpty) ...[
                              const SizedBox(height: 2),
                              Text(
                                widget.body!,
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 12,
                                ),
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ],
                          ],
                        ),
                      ),
                      const SizedBox(width: 8),
                      InkWell(
                        onTap: widget.onClose,
                        borderRadius: BorderRadius.circular(20),
                        child: const Padding(
                          padding: EdgeInsets.all(4),
                          child: Icon(Icons.close,
                              color: Colors.white70, size: 18),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
