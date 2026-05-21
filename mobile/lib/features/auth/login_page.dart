import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:video_player/video_player.dart';

import '../../shared/theme/app_theme.dart';

/// 모바일 로그인 — 풀스크린 hero 비디오 배경 + 폼 오버레이.
/// 사번(DR001 / NR001) + 비밀번호 입력.
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _empIdCtrl = TextEditingController();
  final _pwCtrl = TextEditingController();
  bool _loading = false;
  String? _error;

  VideoPlayerController? _videoCtrl;

  @override
  void initState() {
    super.initState();
    _initVideo();
  }

  Future<void> _initVideo() async {
    try {
      _videoCtrl = VideoPlayerController.asset('assets/videos/hero-video.mp4');
      await _videoCtrl!.initialize();
      _videoCtrl!
        ..setLooping(true)
        ..setVolume(0)
        ..play();
      if (mounted) setState(() {});
    } catch (_) {
      /* fallback: 그라디언트 배경 */
    }
  }

  @override
  void dispose() {
    _empIdCtrl.dispose();
    _pwCtrl.dispose();
    _videoCtrl?.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (_empIdCtrl.text.trim().isEmpty || _pwCtrl.text.isEmpty) {
      setState(() => _error = '사번과 비밀번호를 입력하세요.');
      return;
    }
    setState(() {
      _error = null;
      _loading = true;
    });
    // 데모: 즉시 통과 — Cognito 연동은 Phase 2에서 추가
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;
    setState(() => _loading = false);
    context.go('/worklist');
  }

  @override
  Widget build(BuildContext context) {
    final videoReady = _videoCtrl?.value.isInitialized ?? false;
    return Scaffold(
      backgroundColor: const Color(0xFF1E1B4B), // 비디오 로드 전 깊은 보라
      resizeToAvoidBottomInset: true,
      body: Stack(
        children: [
          // ─── 1) 풀스크린 비디오 배경 ───
          Positioned.fill(
            child: videoReady
                ? FittedBox(
                    fit: BoxFit.cover,
                    child: SizedBox(
                      width: _videoCtrl!.value.size.width,
                      height: _videoCtrl!.value.size.height,
                      child: VideoPlayer(_videoCtrl!),
                    ),
                  )
                : Container(
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        begin: Alignment.topLeft,
                        end: Alignment.bottomRight,
                        colors: [Color(0xFF4338CA), Color(0xFF6D28D9)],
                      ),
                    ),
                  ),
          ),

          // ─── 2) 어두운 오버레이 — 상단 약간 + 하단 진하게 ───
          Positioned.fill(
            child: IgnorePointer(
              child: Container(
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      Color(0x331E1B4B), // 상단 — 살짝
                      Color(0x661E1B4B), // 중간
                      Color(0xCC0F0D30), // 하단 — 진하게 (폼 가독성)
                    ],
                    stops: [0, 0.45, 1.0],
                  ),
                ),
              ),
            ),
          ),

          // ─── 3) 폼 오버레이 — 하단 절반 영역 ───
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 24),
              child: Column(
                children: [
                  const Spacer(flex: 2),

                  // 헤더
                  Align(
                    alignment: Alignment.centerLeft,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Text(
                          '로그인',
                          style: TextStyle(
                            fontSize: 32,
                            fontWeight: FontWeight.bold,
                            color: Colors.white,
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          '응급실 의료진 전용 진단 보조 시스템',
                          style: TextStyle(
                            fontSize: 13,
                            color: Colors.white.withValues(alpha: 0.75),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 28),

                  // 사번
                  _GlassField(
                    label: '사번',
                    controller: _empIdCtrl,
                    enabled: !_loading,
                    hintText: 'DR001',
                  ),
                  const SizedBox(height: 14),

                  // 비밀번호
                  _GlassField(
                    label: '비밀번호',
                    controller: _pwCtrl,
                    enabled: !_loading,
                    obscure: true,
                    onSubmitted: (_) => _handleLogin(),
                  ),

                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Align(
                      alignment: Alignment.centerLeft,
                      child: Text(
                        _error!,
                        style: const TextStyle(
                            fontSize: 13, color: Color(0xFFFCA5A5)),
                      ),
                    ),
                  ],

                  const SizedBox(height: 22),

                  // 로그인 버튼
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF6366F1), // indigo-500
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: AppColors.slate500,
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: _loading ? null : _handleLogin,
                      child: Text(
                        _loading ? '로그인 중…' : '로그인',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),

                  const SizedBox(height: 18),

                  // 찾기 링크
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      _MutedLink(text: '사번 찾기', onTap: () {}),
                      const SizedBox(width: 10),
                      const Text('|',
                          style: TextStyle(
                              color: Color(0x66FFFFFF), fontSize: 13)),
                      const SizedBox(width: 10),
                      _MutedLink(text: '비밀번호 찾기', onTap: () {}),
                    ],
                  ),

                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/* ── 영상 위에 띄우는 반투명 입력 필드 ──
   배경: 검정 30% + 흰 테두리 / 텍스트: 흰색
*/
class _GlassField extends StatelessWidget {
  final String label;
  final TextEditingController controller;
  final bool enabled;
  final bool obscure;
  final String? hintText;
  final ValueChanged<String>? onSubmitted;

  const _GlassField({
    required this.label,
    required this.controller,
    required this.enabled,
    this.obscure = false,
    this.hintText,
    this.onSubmitted,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: TextStyle(
            fontSize: 13,
            color: Colors.white.withValues(alpha: 0.85),
            fontWeight: FontWeight.w500,
          ),
        ),
        const SizedBox(height: 7),
        TextField(
          controller: controller,
          enabled: enabled,
          obscureText: obscure,
          autocorrect: false,
          style: const TextStyle(color: Colors.white, fontSize: 15),
          textInputAction: obscure ? TextInputAction.done : TextInputAction.next,
          onSubmitted: onSubmitted,
          cursorColor: Colors.white,
          decoration: InputDecoration(
            isDense: true,
            hintText: hintText,
            hintStyle: TextStyle(
              color: Colors.white.withValues(alpha: 0.35),
              fontSize: 14,
            ),
            filled: true,
            fillColor: Colors.white.withValues(alpha: 0.08),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            enabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.25), width: 1),
            ),
            focusedBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide:
                  const BorderSide(color: Color(0xFF818CF8), width: 1.5),
            ),
            disabledBorder: OutlineInputBorder(
              borderRadius: BorderRadius.circular(8),
              borderSide: BorderSide(
                  color: Colors.white.withValues(alpha: 0.12), width: 1),
            ),
          ),
        ),
      ],
    );
  }
}

/* ── 영상 위에 흐릿한 텍스트 링크 ── */
class _MutedLink extends StatelessWidget {
  final String text;
  final VoidCallback onTap;
  const _MutedLink({required this.text, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 4, horizontal: 2),
        child: Text(
          text,
          style: TextStyle(
            fontSize: 13,
            color: Colors.white.withValues(alpha: 0.75),
          ),
        ),
      ),
    );
  }
}
