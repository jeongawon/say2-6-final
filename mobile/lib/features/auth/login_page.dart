import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

/// 모바일 로그인 — 웹(EMON Med®) 디자인과 통일.
/// 상단: 브레인 이미지 + EMON 로고 히어로 / 하단: 흰 폼(아이디·비밀번호).
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

  @override
  void dispose() {
    _empIdCtrl.dispose();
    _pwCtrl.dispose();
    super.dispose();
  }

  Future<void> _handleLogin() async {
    if (_empIdCtrl.text.trim().isEmpty || _pwCtrl.text.isEmpty) {
      setState(() => _error = '아이디와 비밀번호를 입력하세요.');
      return;
    }
    setState(() {
      _error = null;
      _loading = true;
    });
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;
    setState(() => _loading = false);
    context.go('/worklist');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.white,
      resizeToAvoidBottomInset: true,
      body: SingleChildScrollView(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ─── 히어로: 브레인 + EMON 아이콘 ───
            const _Hero(),

            // ─── 폼 (흰 배경) ───
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 36),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Login',
                    style: TextStyle(
                      fontSize: 34,
                      fontWeight: FontWeight.bold,
                      color: Color(0xFF0F172A),
                    ),
                  ),
                  const SizedBox(height: 24),

                  _label('아이디'),
                  const SizedBox(height: 8),
                  _field(_empIdCtrl, hint: 'DR001', enabled: !_loading),
                  const SizedBox(height: 16),

                  _label('비밀번호'),
                  const SizedBox(height: 8),
                  _field(_pwCtrl,
                      obscure: true,
                      enabled: !_loading,
                      onSubmitted: (_) => _handleLogin()),

                  if (_error != null) ...[
                    const SizedBox(height: 10),
                    Text(_error!,
                        style: const TextStyle(
                            color: Color(0xFFDC2626), fontSize: 13)),
                  ],

                  const SizedBox(height: 26),

                  SizedBox(
                    height: 54,
                    child: ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: const Color(0xFF4F46E5), // indigo-600
                        foregroundColor: Colors.white,
                        disabledBackgroundColor: const Color(0xFF94A3B8),
                        elevation: 0,
                        shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(10)),
                      ),
                      onPressed: _loading ? null : _handleLogin,
                      child: Text(
                        _loading ? '로그인 중…' : '로그인',
                        style: const TextStyle(
                            fontSize: 17, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ),

                  const SizedBox(height: 16),

                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      _link('아이디 찾기'),
                      const SizedBox(width: 10),
                      const Text('|', style: TextStyle(color: Color(0xFFCBD5E1))),
                      const SizedBox(width: 10),
                      _link('비밀번호 찾기'),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _label(String t) => Text(
        t,
        style: const TextStyle(
            fontSize: 15, fontWeight: FontWeight.bold, color: Color(0xFF1E293B)),
      );

  Widget _field(
    TextEditingController c, {
    String? hint,
    bool obscure = false,
    bool enabled = true,
    ValueChanged<String>? onSubmitted,
  }) {
    OutlineInputBorder border(Color c, [double w = 1]) => OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: c, width: w),
        );
    return TextField(
      controller: c,
      enabled: enabled,
      obscureText: obscure,
      autocorrect: false,
      style: const TextStyle(color: Color(0xFF0F172A), fontSize: 16),
      cursorColor: const Color(0xFF6366F1),
      textInputAction: obscure ? TextInputAction.done : TextInputAction.next,
      onSubmitted: onSubmitted,
      decoration: InputDecoration(
        hintText: hint,
        hintStyle: const TextStyle(color: Color(0xFFCBD5E1), fontSize: 15),
        filled: true,
        fillColor: Colors.white,
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        enabledBorder: border(const Color(0xFFE2E8F0)),
        disabledBorder: border(const Color(0xFFE2E8F0)),
        focusedBorder: border(const Color(0xFF6366F1), 1.6),
      ),
    );
  }

  Widget _link(String t) => GestureDetector(
        onTap: () {},
        child: Text(t,
            style: const TextStyle(fontSize: 14, color: Color(0xFF64748B))),
      );
}

/* ── 히어로: 브레인 배경 + EMON 아이콘 (웹 우측 패널과 동일 컨셉) ── */
class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: 300,
      child: Stack(
        fit: StackFit.expand,
        children: [
          // 그라데이션 베이스 (blue → indigo → violet)
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: [Color(0xFF1D4ED8), Color(0xFF4338CA), Color(0xFF6D28D9)],
              ),
            ),
          ),
          // 브레인 이미지
          Opacity(
            opacity: 0.85,
            child: Image.asset('assets/images/AI.jpg', fit: BoxFit.cover),
          ),
          // 인디고 틴트 + 하단 페이드
          const DecoratedBox(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0x553730A3), Color(0x00000000), Color(0xFFFFFFFF)],
                stops: [0, 0.55, 1.0],
              ),
            ),
          ),
          // 중앙: 'AI' 박스 마스킹 + EMON 아이콘
          Center(
            child: Padding(
              padding: const EdgeInsets.only(bottom: 24),
              child: Stack(
                alignment: Alignment.center,
                children: [
                  // 브레인 속 'AI' 박스 + 로고 곤색 배경 가리기
                  Container(
                    width: 190,
                    height: 130,
                    decoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        colors: [Color(0xFF16306A), Color(0x0016306A)],
                      ),
                    ),
                  ),
                  Image.asset('assets/images/EMON.jpg',
                      width: 150, fit: BoxFit.contain),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
