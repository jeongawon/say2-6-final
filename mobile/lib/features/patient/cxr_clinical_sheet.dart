import 'dart:convert';
import 'dart:typed_data';
import 'package:flutter/material.dart';

import '../../core/api/client.dart';
import '../../shared/theme/app_theme.dart';

/// 흉부 X-ray 검사결과지 — 백엔드 CXR modal 응답을 사람이 읽을 수 있게.
/// 웹의 CXRView에서 핵심 정보만 추려서 모바일 한 화면에 정리.
class CxrClinicalSheet extends StatelessWidget {
  final String patientName;
  final int age;
  final String sex;
  final String? patientId;
  final String? subjectId; // MIMIC subject_id → /assets/cxr/{id}
  final Map<String, dynamic>? measurements;
  final Map<String, dynamic>? metadata; // image_size, mask_base64, view
  final List<String> findingsText;
  final String? impression;
  final String? summary;
  final String? riskLevel;

  const CxrClinicalSheet({
    super.key,
    this.patientName = '환자',
    this.age = 0,
    this.sex = 'M',
    this.patientId,
    this.subjectId,
    this.measurements,
    this.metadata,
    this.findingsText = const [],
    this.impression,
    this.summary,
    this.riskLevel,
  });

  String get _sexLabel => sex == 'M' ? '남' : sex == 'F' ? '여' : sex;

  @override
  Widget build(BuildContext context) {
    final m = measurements ?? const {};
    final ctr = m['ctr'] as num?;
    final ctrStatus = m['ctr_status'] as String?;
    final lungArea = m['lung_area_ratio'] as num?;
    final leftCp = m['left_cp_status'] as String?;
    final rightCp = m['right_cp_status'] as String?;
    final leftCpAngle = m['left_cp_angle'] as num?;
    final rightCpAngle = m['right_cp_angle'] as num?;

    // backend가 S3에서 받아 스트리밍 — /mimic/cxr/{id} (CloudFront가 /mimic/* → ALB 라우팅).
    // (/assets/* 는 CloudFront가 S3로 보내 이미지가 안 떠서 /mimic/cxr 로 변경 — 웹과 동일.)
    final imageUrl = subjectId != null ? '$apiBaseUrl/mimic/cxr/$subjectId' : null;

    return Container(
      color: Colors.white,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // 헤더
          _Header(
            patientName: patientName,
            age: age,
            sexLabel: _sexLabel,
            patientId: patientId,
            riskLevel: riskLevel,
          ),

          // CXR 이미지 영역 — 원본 X-ray + UNet 세그 마스크 + 측정선·라벨 (웹 CXRView 동일)
          _CxrImageWithOverlay(
            imageUrl: imageUrl,
            measurements: measurements,
            metadata: metadata,
            riskLevel: riskLevel,
            subjectId: subjectId,
          ),

          // 측정값
          Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const _SectionLabel('측정값 (Measurements)'),
                const SizedBox(height: 6),
                _MeasureRow(
                  k: '심흉곽비 (CTR)',
                  v: ctr != null ? ctr.toStringAsFixed(2) : '—',
                  status: ctrStatus,
                  ref: '< 0.50',
                ),
                _MeasureRow(
                  k: '폐 면적 비율',
                  v: lungArea != null
                      ? '${(lungArea * 100).toStringAsFixed(1)}%'
                      : '—',
                  ref: '> 50%',
                ),
                _MeasureRow(
                  k: '좌측 늑횡각',
                  v: leftCpAngle != null
                      ? '${leftCpAngle.toStringAsFixed(0)}°'
                      : '—',
                  status: leftCp,
                  ref: '예각',
                ),
                _MeasureRow(
                  k: '우측 늑횡각',
                  v: rightCpAngle != null
                      ? '${rightCpAngle.toStringAsFixed(0)}°'
                      : '—',
                  status: rightCp,
                  ref: '예각',
                ),
              ],
            ),
          ),

          // 판독 소견
          if (findingsText.isNotEmpty) ...[
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _SectionLabel('판독 소견 (Findings)'),
                  const SizedBox(height: 6),
                  for (final f in findingsText)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('· ',
                              style: TextStyle(
                                  color: AppColors.vunoCyanDim,
                                  fontWeight: FontWeight.bold)),
                          Expanded(
                            child: Text(f,
                                style: const TextStyle(
                                    fontSize: 11,
                                    color: AppColors.slate700,
                                    height: 1.5)),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ],

          // 결론
          if (impression != null && impression!.isNotEmpty)
            Container(
              margin: const EdgeInsets.all(12),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                border: Border.all(color: AppColors.slate300),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _SectionLabel('결론 (Impression)'),
                  const SizedBox(height: 4),
                  Text(impression!,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: AppColors.slate900,
                          height: 1.5)),
                ],
              ),
            )
          else if (summary != null && summary!.isNotEmpty)
            Container(
              margin: const EdgeInsets.all(12),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.slate50,
                border: Border.all(color: AppColors.slate300),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const _SectionLabel('요약 (Summary)'),
                  const SizedBox(height: 4),
                  Text(summary!,
                      style: const TextStyle(
                          fontSize: 11,
                          color: AppColors.slate800,
                          height: 1.6)),
                ],
              ),
            ),

          _Footer(modal: 'CXR'),
        ],
      ),
    );
  }
}

Future<void> showCxrClinicalSheet(
  BuildContext context, {
  required String patientName,
  required int age,
  required String sex,
  String? patientId,
  String? subjectId,
  Map<String, dynamic>? measurements,
  Map<String, dynamic>? metadata,
  List<String> findingsText = const [],
  String? impression,
  String? summary,
  String? riskLevel,
}) {
  return showDialog<void>(
    context: context,
    barrierColor: Colors.black54,
    builder: (ctx) => Dialog.fullscreen(
      backgroundColor: AppColors.slate100,
      child: Scaffold(
        backgroundColor: AppColors.slate100,
        appBar: AppBar(
          leading: const SizedBox(),
          leadingWidth: 0,
          title: const Text('흉부 X-ray 판독결과지',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.bold,
                  color: AppColors.slate900)),
          actions: [
            IconButton(
                icon: const Icon(Icons.close, color: AppColors.slate700),
                onPressed: () => Navigator.pop(ctx)),
          ],
        ),
        body: SingleChildScrollView(
          padding: const EdgeInsets.all(12),
          child: Container(
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border.all(color: AppColors.slate300),
              borderRadius: BorderRadius.circular(4),
            ),
            child: CxrClinicalSheet(
              patientName: patientName,
              age: age,
              sex: sex,
              patientId: patientId,
              subjectId: subjectId,
              measurements: measurements,
              metadata: metadata,
              findingsText: findingsText,
              impression: impression,
              summary: summary,
              riskLevel: riskLevel,
            ),
          ),
        ),
      ),
    ),
  );
}

// ────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────
class _Header extends StatelessWidget {
  final String patientName;
  final int age;
  final String sexLabel;
  final String? patientId;
  final String? riskLevel;
  const _Header({
    required this.patientName,
    required this.age,
    required this.sexLabel,
    this.patientId,
    this.riskLevel,
  });

  @override
  Widget build(BuildContext context) {
    final (riskBg, riskFg, riskLabel) = switch (riskLevel) {
      'critical' => (
          AppColors.critical.withAlpha(40),
          AppColors.critical,
          'CRITICAL'
        ),
      'urgent' => (
          AppColors.urgent.withAlpha(40),
          AppColors.urgent,
          'URGENT'
        ),
      'routine' => (
          AppColors.emerald100,
          AppColors.emerald700,
          'ROUTINE'
        ),
      _ => (AppColors.slate100, AppColors.slate600, '—'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: const BoxDecoration(
          border: Border(bottom: BorderSide(color: AppColors.slate300))),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('$patientName · $sexLabel · $age세',
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: AppColors.slate900)),
                if (patientId != null)
                  Text('ID: $patientId',
                      style: const TextStyle(
                          fontSize: 10,
                          color: AppColors.slate500,
                          fontFamily: 'monospace')),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
                color: riskBg, borderRadius: BorderRadius.circular(2)),
            child: Text(riskLabel,
                style: TextStyle(
                    color: riskFg,
                    fontSize: 10,
                    fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}

class _Footer extends StatelessWidget {
  final String modal;
  const _Footer({required this.modal});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: const BoxDecoration(
          border: Border(top: BorderSide(color: AppColors.slate200))),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text('say-6 Deep$modal v2.0',
              style: const TextStyle(
                  fontSize: 9,
                  color: AppColors.slate400,
                  fontFamily: 'monospace')),
          const Text('응급실 멀티모달 AI 진단 보조',
              style: TextStyle(
                  fontSize: 9,
                  color: AppColors.slate400,
                  fontFamily: 'monospace')),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  final String text;
  const _SectionLabel(this.text);
  @override
  Widget build(BuildContext context) => Text(text,
      style: const TextStyle(
          fontSize: 14,
          fontWeight: FontWeight.bold,
          color: AppColors.slate900));
}

class _MeasureRow extends StatelessWidget {
  final String k;
  final String v;
  final String? status; // 'normal' / 'enlarged' / 'blunt' etc.
  final String? ref;
  const _MeasureRow({required this.k, required this.v, this.status, this.ref});

  @override
  Widget build(BuildContext context) {
    final abnormal = status != null &&
        status != 'normal' &&
        status != 'unknown' &&
        status!.isNotEmpty;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          Expanded(
              flex: 4,
              child: Text(k,
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.slate700))),
          Expanded(
            flex: 3,
            child: Text(v,
                textAlign: TextAlign.right,
                style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.bold,
                    fontFamily: 'monospace',
                    color: abnormal
                        ? AppColors.critical
                        : AppColors.slate900)),
          ),
          if (ref != null) ...[
            const SizedBox(width: 8),
            Expanded(
              flex: 3,
              child: Text(ref!,
                  style: const TextStyle(
                      fontSize: 10,
                      color: AppColors.slate400,
                      fontFamily: 'monospace')),
            ),
          ],
        ],
      ),
    );
  }
}

class _ImagePlaceholder extends StatelessWidget {
  const _ImagePlaceholder();
  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.image_outlined, size: 48, color: Colors.white24),
          SizedBox(height: 8),
          Text('CXR 이미지', style: TextStyle(color: Colors.white38)),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// CXR 원본 + 측정선·라벨 오버레이 (웹 CXRView SVG 와 1:1 포팅)
//   - 흉곽 가로 (파랑 점선) + 라벨
//   - 심장 가로 (빨강 굵게) + 라벨
//   - 종격동 가로 (노랑 점선) + 라벨
//   - 기관 세로 (보라 점선) + 라벨
//   - 횡격막 (하늘 점선) + 우/좌 라벨
//   - 늑횡각 좌·우 (초록 점) + 라벨
//   - 우상단 CTR 배지
//   - 좌상단 URGENT / VIEW 배지, 하단 범례
// ─────────────────────────────────────────────────────────────────
class _CxrImageWithOverlay extends StatelessWidget {
  final String? imageUrl;
  final Map<String, dynamic>? measurements;
  final Map<String, dynamic>? metadata;
  final String? riskLevel;
  final String? subjectId;
  const _CxrImageWithOverlay({
    required this.imageUrl,
    required this.measurements,
    required this.metadata,
    required this.riskLevel,
    required this.subjectId,
  });

  @override
  Widget build(BuildContext context) {
    final m = measurements ?? const {};
    final meta = metadata ?? const {};
    // 백엔드 응답 metadata.image_size — chest-svc-pre 원본 X-ray의 픽셀 크기
    // 좌표(흉곽/심장/CP각 등)가 이 좌표계 기준이므로 SizedBox도 동일 크기여야 함
    final sizeArr = (meta['image_size'] as List?)?.cast<num>();
    final imgW = sizeArr != null && sizeArr.length >= 2
        ? sizeArr[0].toDouble()
        : 3056.0;
    final imgH = sizeArr != null && sizeArr.length >= 2
        ? sizeArr[1].toDouble()
        : 2544.0;

    final view = ((meta['view'] ?? 'PA') as String).toUpperCase();
    final maskB64 = meta['mask_base64'] as String?;
    Uint8List? maskBytes;
    if (maskB64 != null && maskB64.isNotEmpty) {
      try {
        maskBytes = base64Decode(maskB64);
      } catch (_) {/* invalid base64 → skip */}
    }

    final ctr = (m['ctr'] as num?)?.toDouble();
    final ctrStatus = m['ctr_status']?.toString();
    final risk = riskLevel ?? 'routine';

    return AspectRatio(
      aspectRatio: imgW / imgH,   // 원본 비율 그대로 — letterboxing 없음
      child: ClipRect(            // 라벨이 이미지 영역 밖으로 흘러나오지 않도록
        child: Container(
          color: Colors.black,
          child: imageUrl == null
              ? const _ImagePlaceholder()
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    // ① 원본 X-ray
                    Image.network(
                      imageUrl!,
                      fit: BoxFit.contain,
                      errorBuilder: (_, _, _) => const _ImagePlaceholder(),
                    ),
                    // ② UNet 세그멘테이션 마스크 (반투명 색상 오버레이)
                    if (maskBytes != null)
                      Positioned.fill(
                        child: Opacity(
                          opacity: 0.45,
                          child: Image.memory(
                            maskBytes,
                            fit: BoxFit.contain,
                            // CSS mix-blend-mode: screen 과 가장 가까운 효과
                            color: null,
                            colorBlendMode: BlendMode.screen,
                          ),
                        ),
                      ),
                    // ③ 측정선 + 라벨 — FittedBox로 원본 픽셀 좌표를 위젯에 매핑
                    Positioned.fill(
                      child: FittedBox(
                        fit: BoxFit.contain,
                        child: SizedBox(
                          width: imgW,
                          height: imgH,
                          child: CustomPaint(
                            painter: _CxrOverlayPainter(
                              measurements: m,
                              imageW: imgW,
                              imageH: imgH,
                            ),
                          ),
                        ),
                      ),
                    ),
                    // ④ 좌상단 — 위험도 + 뷰 배지
                    Positioned(
                      top: 8,
                      left: 8,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _PacsBadge(
                            text: risk.toUpperCase(),
                            color: switch (risk) {
                              'critical' => AppColors.critical,
                              'urgent' => AppColors.amber600,
                              _ => AppColors.emerald600,
                            },
                            filled: true,
                          ),
                          const SizedBox(height: 4),
                          _PacsBadge(text: '$view VIEW', color: AppColors.slate600),
                        ],
                      ),
                    ),
                    // ⑤ 우상단 — CTR 배지
                    if (ctr != null)
                      Positioned(
                        top: 8,
                        right: 8,
                        child: Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: Colors.black,
                            border: Border.all(
                                color: ctrStatus == 'cardiomegaly'
                                    ? AppColors.critical
                                    : Colors.white,
                                width: 1.5),
                          ),
                          child: Text(
                            'CTR = ${ctr.toStringAsFixed(2)}',
                            style: const TextStyle(
                              color: Colors.white,
                              fontFamily: 'monospace',
                              fontWeight: FontWeight.bold,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                    // ⑥ 하단 — 색상 범례
                    Positioned(
                      bottom: 6,
                      right: 6,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 6, vertical: 3),
                        color: Colors.black.withAlpha(180),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: const [
                            _LegendDot(color: Color(0xFF3b82f6), label: '흉곽'),
                            SizedBox(width: 6),
                            _LegendDot(color: Color(0xFFef4444), label: '심장'),
                            SizedBox(width: 6),
                            _LegendDot(color: Color(0xFFfacc15), label: '종격동'),
                            SizedBox(width: 6),
                            _LegendDot(color: Color(0xFFa855f7), label: '기관'),
                            SizedBox(width: 6),
                            _LegendDot(color: Color(0xFF60a5fa), label: '횡격막'),
                            SizedBox(width: 6),
                            _LegendDot(color: Color(0xFF22c55e), label: 'CP각'),
                          ],
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

// 작은 사각 배지
class _PacsBadge extends StatelessWidget {
  final String text;
  final Color color;
  final bool filled;
  const _PacsBadge({required this.text, required this.color, this.filled = false});
  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: filled ? color : Colors.black.withAlpha(220),
        border: Border.all(color: color, width: 1.2),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: filled ? Colors.white : color,
          fontSize: 10,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.5,
        ),
      ),
    );
  }
}

class _LegendDot extends StatelessWidget {
  final Color color;
  final String label;
  const _LegendDot({required this.color, required this.label});
  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(width: 8, height: 8, decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
        const SizedBox(width: 3),
        Text(label, style: const TextStyle(color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold)),
      ],
    );
  }
}

// 측정선 + 라벨 — 원본 픽셀 좌표를 그대로 그림 (FittedBox 가 스케일)
class _CxrOverlayPainter extends CustomPainter {
  final Map<String, dynamic> measurements;
  final double imageW;
  final double imageH;
  _CxrOverlayPainter({
    required this.measurements,
    required this.imageW,
    required this.imageH,
  });

  // 색상 (웹과 동일)
  static const _thoraxColor = Color(0xFF3b82f6);
  static const _heartColor = Color(0xFFef4444);
  static const _medColor = Color(0xFFfacc15);
  static const _trachColor = Color(0xFFa855f7);
  static const _diaphColor = Color(0xFF60a5fa);
  static const _cpColor = Color(0xFF22c55e);

  @override
  void paint(Canvas canvas, Size size) {
    final m = measurements;
    final stroke = imageW * 0.0035;
    final fs = imageW * 0.022;

    final lines = (m['ctr_lines'] as Map?)?.cast<String, dynamic>() ?? const {};
    final trach = (m['trachea_coords'] as Map?)?.cast<String, dynamic>() ?? const {};
    final diaph = (m['diaphragm_coords'] as Map?)?.cast<String, dynamic>() ?? const {};
    final cp = (m['cp_angle_coords'] as Map?)?.cast<String, dynamic>() ?? const {};
    final medC = (m['mediastinum_coords'] as Map?)?.cast<String, dynamic>() ?? const {};

    double? d(Map src, String key) => (src[key] as num?)?.toDouble();

    // ── ① 흉곽 가로 (파랑 점선)
    final thLeft = d(lines, 'thorax_left_x');
    final thRight = d(lines, 'thorax_right_x');
    final thRow = d(lines, 'thorax_row');
    if (thLeft != null && thRight != null && thRow != null) {
      _drawDashedLine(canvas, Offset(thLeft, thRow), Offset(thRight, thRow),
          _thoraxColor, stroke, [stroke * 4, stroke * 2]);
      final thoraxW = (thRight - thLeft).round();
      _drawLabel(canvas, Offset((thLeft + thRight) / 2, thRow - fs * 1.2),
          '흉곽 ${thoraxW}px', _thoraxColor, fs, anchor: _Anchor.middle);
    }

    // ── ② 심장 가로 (빨강 굵게)
    final htLeft = d(lines, 'heart_left_x');
    final htRight = d(lines, 'heart_right_x');
    final htRow = d(lines, 'heart_row');
    if (htLeft != null && htRight != null && htRow != null) {
      _drawSolidLine(canvas, Offset(htLeft, htRow), Offset(htRight, htRow),
          _heartColor, stroke * 1.4);
      final heartW = (htRight - htLeft).round();
      _drawLabel(canvas, Offset((htLeft + htRight) / 2, htRow - fs * 1.0),
          '심장 ${heartW}px', _heartColor, fs, anchor: _Anchor.middle);
    }

    // ── ③ 종격동 가로 (노랑 점선)
    final mxL = d(medC, 'x_left');
    final mxR = d(medC, 'x_right');
    final myL = d(medC, 'y_level');
    if (mxL != null && mxR != null && myL != null) {
      _drawDashedLine(canvas, Offset(mxL, myL), Offset(mxR, myL),
          _medColor, stroke, [stroke * 3, stroke * 2]);
      final medW = (mxR - mxL).round();
      final medStatus = m['mediastinum_status']?.toString();
      _drawLabel(canvas, Offset((mxL + mxR) / 2, myL + fs * 1.6),
          '종격동 ${medW}px${medStatus != null ? " ($medStatus)" : ""}',
          _medColor, fs * 0.9, anchor: _Anchor.middle);
    }

    // ── ④ 기관 (보라 점선)
    final txC = d(trach, 'thorax_center_x');
    final tyS = d(trach, 'y_start');
    final tyE = d(trach, 'y_end');
    if (txC != null && tyS != null && tyE != null) {
      _drawDashedLine(canvas, Offset(txC, tyS), Offset(txC, tyE),
          _trachColor.withAlpha(140), stroke * 0.7, [stroke * 2, stroke * 2]);
      _drawLabel(canvas, Offset(txC, tyS - fs * 0.6),
          '기관 정중', _trachColor, fs * 0.9, anchor: _Anchor.middle);
    }

    // ── ⑤ 횡격막 (하늘 점선) + 좌·우 라벨 — 이미지 안쪽으로 펼치도록 padding 적용
    final dLeft = (diaph['left'] as List?)?.cast<num>();
    final dRight = (diaph['right'] as List?)?.cast<num>();
    if (dLeft != null && dLeft.length >= 2 && dRight != null && dRight.length >= 2) {
      final lx = dLeft[0].toDouble();
      final ly = dLeft[1].toDouble();
      final rx = dRight[0].toDouble();
      final ry = dRight[1].toDouble();
      _drawDashedLine(canvas, Offset(lx, ly), Offset(rx, ry),
          _diaphColor, stroke, [stroke * 3, stroke * 2]);
      // 좌측 점(viewer's left = patient's right) → 라벨도 오른쪽으로 펼침 (start)
      _drawLabel(canvas, Offset(lx + fs * 0.3, ly + fs * 1.4),
          '우(R) 횡격막', _diaphColor, fs * 0.9, anchor: _Anchor.start);
      // 우측 점(viewer's right = patient's left) → 라벨도 왼쪽으로 펼침 (end)
      _drawLabel(canvas, Offset(rx - fs * 0.3, ry + fs * 1.4),
          '좌(L) 횡격막', _diaphColor, fs * 0.9, anchor: _Anchor.end);
    }

    // ── ⑥ CP angle (초록 점)
    // 좌·우 CP 점은 이미지 가장자리에 위치 — 라벨이 이미지 밖으로 흘러나오지 않도록
    // 안쪽 방향으로 펼치게 anchor 처리.
    void cpDraw(List<num>? coords, num? angle, String? status, String side) {
      if (coords == null || coords.length < 2) return;
      final x = coords[0].toDouble();
      final y = coords[1].toDouble();
      if (x <= 0 || y <= 0) return;
      final paint = Paint()..color = _cpColor..style = PaintingStyle.fill;
      canvas.drawCircle(Offset(x, y), stroke * 2, paint);
      if (angle != null) {
        final s = status == 'normal' ? '정상' : status ?? '-';
        // 가장자리에서 안쪽으로: 좌측 점은 start (오른쪽으로 펼침), 우측 점은 end (왼쪽으로 펼침)
        // 이미지 중앙 기준 어느 쪽 절반에 있는지 판단
        final isLeftHalf = x < imageW / 2;
        final anchor = isLeftHalf ? _Anchor.start : _Anchor.end;
        // 점 옆에 라벨이 살짝 떨어져 그려지도록 약간 오프셋
        final labelX = isLeftHalf ? x + fs * 0.3 : x - fs * 0.3;
        _drawLabel(canvas, Offset(labelX, y - fs * 0.6),
            '$side CP ${angle.toDouble().toStringAsFixed(1)}°($s)',
            _cpColor, fs * 0.9, anchor: anchor);
      }
    }
    cpDraw((cp['right'] as List?)?.cast<num>(), m['right_cp_angle'] as num?,
        m['right_cp_status']?.toString(), '우');
    cpDraw((cp['left'] as List?)?.cast<num>(), m['left_cp_angle'] as num?,
        m['left_cp_status']?.toString(), '좌');
  }

  void _drawSolidLine(Canvas c, Offset a, Offset b, Color color, double w) {
    final p = Paint()
      ..color = color
      ..strokeWidth = w
      ..style = PaintingStyle.stroke;
    c.drawLine(a, b, p);
  }

  void _drawDashedLine(Canvas c, Offset a, Offset b, Color color, double w, List<double> pattern) {
    final p = Paint()
      ..color = color
      ..strokeWidth = w
      ..style = PaintingStyle.stroke;
    final total = (b - a).distance;
    final dir = (b - a) / total;
    double consumed = 0;
    bool dash = true;
    while (consumed < total) {
      final segLen = pattern[(dash ? 0 : 1) % pattern.length];
      final next = (consumed + segLen).clamp(0, total).toDouble();
      if (dash) {
        c.drawLine(a + dir * consumed, a + dir * next, p);
      }
      consumed = next;
      dash = !dash;
    }
  }

  void _drawLabel(Canvas c, Offset center, String text, Color color, double fontSize, {required _Anchor anchor}) {
    final tp = TextPainter(
      text: TextSpan(
          text: text,
          style: TextStyle(
              color: color,
              fontSize: fontSize,
              fontWeight: FontWeight.bold)),
      textDirection: TextDirection.ltr,
    );
    tp.layout();
    final padX = fontSize * 0.4;
    final padY = fontSize * 0.25;
    final w = tp.width + padX * 2;
    final h = tp.height + padY * 2;
    final left = switch (anchor) {
      _Anchor.middle => center.dx - w / 2,
      _Anchor.start => center.dx,
      _Anchor.end => center.dx - w,
    };
    final top = center.dy - h;
    final bgPaint = Paint()..color = Colors.black.withAlpha(190);
    c.drawRRect(
      RRect.fromRectAndRadius(
          Rect.fromLTWH(left, top, w, h), Radius.circular(fontSize * 0.15)),
      bgPaint,
    );
    tp.paint(c, Offset(left + padX, top + padY));
  }

  @override
  bool shouldRepaint(covariant _CxrOverlayPainter old) =>
      old.measurements != measurements;
}

enum _Anchor { start, middle, end }
