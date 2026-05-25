import 'package:flutter/material.dart';

/// say-6 컬러 토큰 — frontend/tailwind.config.js와 동일 값.
/// 웹과 시각적 일관성을 위해 한 글자 안 바꿈.
class AppColors {
  // 의료 표준 응급도
  static const critical = Color(0xFFDC2626); // red-600
  static const urgent = Color(0xFFEA580C);   // orange-600
  static const warning = Color(0xFFCA8A04);  // yellow-600
  static const normal = Color(0xFF16A34A);   // green-600

  // say-6 브랜드 (인디고)
  static const brand50 = Color(0xFFEEF2FF);
  static const brand100 = Color(0xFFE0E7FF);
  static const brand200 = Color(0xFFC7D2FE);
  static const brand500 = Color(0xFF6366F1);
  static const brand600 = Color(0xFF4F46E5);
  static const brand700 = Color(0xFF4338CA);

  // AI 영역 (바이올렛)
  static const aiAccent = Color(0xFF8B5CF6);
  static const aiBg = Color(0xFFF5F3FF);
  static const aiBorder = Color(0xFFDDD6FE);

  // VUNO (다크 모드 브랜드 사이트)
  static const vunoBg = Color(0xFF0F172A);     // slate-900
  static const vunoSurface = Color(0xFF162439);
  static const vunoCyan = Color(0xFF2DD4BF);   // teal-400
  static const vunoCyanDim = Color(0xFF14B8A6);

  // Slate (Tailwind)
  static const slate50 = Color(0xFFF8FAFC);
  static const slate100 = Color(0xFFF1F5F9);
  static const slate200 = Color(0xFFE2E8F0);
  static const slate300 = Color(0xFFCBD5E1);
  static const slate400 = Color(0xFF94A3B8);
  static const slate500 = Color(0xFF64748B);
  static const slate600 = Color(0xFF475569);
  static const slate700 = Color(0xFF334155);
  static const slate800 = Color(0xFF1E293B);
  static const slate900 = Color(0xFF0F172A);

  // KTAS 컬러 (한국 응급의료 표준)
  static const ktasBg1 = Color(0xFF2563EB); // blue-600 (소생)
  static const ktasBg2 = Color(0xFFDC2626); // red-600 (긴급)
  static const ktasBg3 = Color(0xFFF59E0B); // amber-500 (응급)
  static const ktasBg4 = Color(0xFF059669); // emerald-600 (준응급)
  static const ktasBg5 = Color(0xFF64748B); // slate-500 (비응급)

  // Emerald (검사 완료)
  static const emerald50 = Color(0xFFECFDF5);
  static const emerald100 = Color(0xFFD1FAE5);
  static const emerald300 = Color(0xFF6EE7B7);
  static const emerald400 = Color(0xFF34D399);
  static const emerald600 = Color(0xFF059669);
  static const emerald700 = Color(0xFF047857);
  static const emerald800 = Color(0xFF065F46);

  // Amber (분석 중)
  static const amber50 = Color(0xFFFFFBEB);
  static const amber100 = Color(0xFFFEF3C7);
  static const amber200 = Color(0xFFFDE68A);
  static const amber300 = Color(0xFFFCD34D);
  static const amber400 = Color(0xFFFBBF24);
  static const amber600 = Color(0xFFD97706);
  static const amber700 = Color(0xFFB45309);
  static const amber900 = Color(0xFF78350F);

  // Purple (AI rec status)
  static const purple50 = Color(0xFFFAF5FF);
  static const purple100 = Color(0xFFF3E8FF);
  static const purple300 = Color(0xFFD8B4FE);
  static const purple600 = Color(0xFF9333EA);
  static const purple700 = Color(0xFF7E22CE);

  // Blue (소견서 생성 완료 · 확정 대기)
  static const blue50 = Color(0xFFEFF6FF);
  static const blue300 = Color(0xFF93C5FD);
  static const blue700 = Color(0xFF1D4ED8);
}

/// KTAS 1~5 메타 (label, bg color) — types/triage.ts의 KTAS_META 그대로
class KtasMeta {
  final String label;
  final Color bg;
  const KtasMeta({required this.label, required this.bg});

  static const Map<int, KtasMeta> all = {
    1: KtasMeta(label: '소생', bg: AppColors.ktasBg1),
    2: KtasMeta(label: '긴급', bg: AppColors.ktasBg2),
    3: KtasMeta(label: '응급', bg: AppColors.ktasBg3),
    4: KtasMeta(label: '준응급', bg: AppColors.ktasBg4),
    5: KtasMeta(label: '비응급', bg: AppColors.ktasBg5),
  };

  static KtasMeta of(int k) => all[k] ?? all[5]!;
}

/// AI 1·2·3차 권고 컬러 — 웹 RANK_META 그대로
class RankMeta {
  final String label;
  final Color badgeBg;
  final Color barBg;
  final Color barBorder;
  const RankMeta({
    required this.label,
    required this.badgeBg,
    required this.barBg,
    required this.barBorder,
  });

  static const Map<int, RankMeta> all = {
    1: RankMeta(
      label: '1차 권고',
      badgeBg: AppColors.purple600,
      barBg: AppColors.purple50,
      barBorder: AppColors.purple300,
    ),
    2: RankMeta(
      label: '2차 권고',
      badgeBg: Color(0xFF2563EB), // blue-600
      barBg: Color(0xFFEFF6FF),   // blue-50
      barBorder: Color(0xFF93C5FD), // blue-300
    ),
    3: RankMeta(
      label: '3차 권고',
      badgeBg: AppColors.emerald600,
      barBg: AppColors.emerald50,
      barBorder: AppColors.emerald300,
    ),
  };

  static RankMeta of(int r) => all[r] ?? all[1]!;
}

ThemeData buildSay6Theme() {
  return ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.brand600,
      brightness: Brightness.light,
      surface: Colors.white,
    ),
    scaffoldBackgroundColor: AppColors.slate50,
    fontFamily: 'system-ui',
    appBarTheme: const AppBarTheme(
      backgroundColor: Colors.white,
      foregroundColor: AppColors.slate900,
      elevation: 0,
      scrolledUnderElevation: 0,
      surfaceTintColor: Colors.transparent,
      shape: Border(bottom: BorderSide(color: AppColors.slate200)),
      centerTitle: false,
    ),
    cardTheme: const CardThemeData(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        side: BorderSide(color: AppColors.slate300),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.brand600,
        foregroundColor: Colors.white,
        minimumSize: const Size(double.infinity, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(6)),
      ),
    ),
  );
}
