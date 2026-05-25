import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// 백엔드 실시간 연결 유무 뱃지 — 웹 components/v2/LiveBadge.tsx 모바일 포팅.
/// AI 검사 권고 패널 헤더 우측에서 LIVE / 연결 중 / 오프라인을 표시.
enum LiveStatus { live, connecting, offline }

class LiveBadge extends StatelessWidget {
  final LiveStatus status;
  const LiveBadge({super.key, required this.status});

  @override
  Widget build(BuildContext context) {
    final isLive = status == LiveStatus.live;
    final label = isLive
        ? 'LIVE'
        : status == LiveStatus.connecting
            ? '연결 중…'
            : '오프라인';
    final (bg, border, fg, dot) = isLive
        ? (
            AppColors.emerald50,
            AppColors.emerald300,
            AppColors.emerald700,
            AppColors.emerald600
          )
        : (
            AppColors.slate50,
            AppColors.slate200,
            AppColors.slate500,
            AppColors.slate400
          );

    return Container(
      height: 20,
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Dot(color: dot, pulse: isLive),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontSize: 10,
              fontWeight: FontWeight.bold,
              letterSpacing: 0.8,
            ),
          ),
        ],
      ),
    );
  }
}

/// LIVE일 때 맥동하는 점 (웹 animate-pulse 대응).
class _Dot extends StatefulWidget {
  final Color color;
  final bool pulse;
  const _Dot({required this.color, required this.pulse});

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1100),
  );

  @override
  void initState() {
    super.initState();
    if (widget.pulse) _ctrl.repeat(reverse: true);
  }

  @override
  void didUpdateWidget(_Dot old) {
    super.didUpdateWidget(old);
    if (widget.pulse && !_ctrl.isAnimating) {
      _ctrl.repeat(reverse: true);
    } else if (!widget.pulse && _ctrl.isAnimating) {
      _ctrl.stop();
      _ctrl.value = 0;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final dot = Container(
      width: 6,
      height: 6,
      decoration: BoxDecoration(color: widget.color, shape: BoxShape.circle),
    );
    if (!widget.pulse) return dot;
    return FadeTransition(
      opacity: Tween<double>(begin: 1, end: 0.35).animate(_ctrl),
      child: dot,
    );
  }
}
