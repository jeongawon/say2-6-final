import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show FontFeature;

import 'package:fl_chart/fl_chart.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/ops_api.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/emon_top_bar.dart';

/// 웹 frontend/src/pages/v2/AdminDashboardPage.tsx의 모바일 이식 —
/// AWS 인프라 운영 모니터링 대시보드 (전부 목업 데이터).
/// monitoring-alarms-stack 기준 KPI/알람/ECS/ALB/Aurora/AI모달 시각화.
/// 배포 후 CloudWatch(/ops/alarms · /ops/metrics) 연결 예정.
class DashboardPage extends ConsumerStatefulWidget {
  const DashboardPage({super.key});

  @override
  ConsumerState<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends ConsumerState<DashboardPage> {
  DateTime _updatedAt = DateTime.now();
  Timer? _clock;

  @override
  void initState() {
    super.initState();
    // 1초 시계 갱신 (데이터는 opsMetricsProvider가 20초 폴링 — CloudWatch 실연동)
    _clock = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _updatedAt = DateTime.now());
    });
  }

  @override
  void dispose() {
    _clock?.cancel();
    super.dispose();
  }

  void _refresh() {
    ref.invalidate(opsMetricsProvider);
    setState(() => _updatedAt = DateTime.now());
  }

  // 차트 컬러 (웹 C 토큰과 동일)
  static const _indigo = AppColors.brand600; // #4F46E5
  static const _violet = AppColors.aiAccent; // #8B5CF6
  static const _emerald = Color(0xFF10B981);
  static const _red = Color(0xFFEF4444);
  static const _blue = Color(0xFF3B82F6);

  // 실데이터(List<double>) → 차트용 FlSpot 변환.
  List<FlSpot> _spots(List<double> s) =>
      [for (var i = 0; i < s.length; i++) FlSpot(i.toDouble(), s[i])];

  double _last(List<FlSpot> s) => s.isEmpty ? 0 : s.last.y;

  // 서비스 가동 여부 — running 있으면 그 값, 없으면 health(ECG/CXR/LAB) / 메트릭 유무.
  bool _serviceUp(OpsService s, Map<String, bool> health) {
    if (s.running != null) return s.running! > 0;
    final k = s.key.toUpperCase();
    if (k == 'ECG' || k == 'CXR' || k == 'LAB') return health[k] ?? s.cpu.isNotEmpty;
    return s.cpu.isNotEmpty; // orchestrator 등 — 메트릭 흐르면 정상
  }

  String _serviceTasks(OpsService s, Map<String, bool> health) {
    if (s.running != null && s.desired != null) return '${s.running}/${s.desired}';
    return _serviceUp(s, health) ? '정상' : '중단';
  }

  String _fmtClock(DateTime d) {
    String p(int n) => n.toString().padLeft(2, '0');
    return '${p(d.hour)}:${p(d.minute)}:${p(d.second)}';
  }

  @override
  Widget build(BuildContext context) {
    // ── 실데이터(/ops/metrics + /ops/health, CloudWatch 20초 폴링) ──
    final async = ref.watch(opsMetricsProvider);
    final m = async.asData?.value;
    final health = m?.health ?? const <String, bool>{};
    final loading = m == null;

    // ── ECS 서비스 ──
    final services = <_Service>[
      for (final s in (m?.services ?? const <OpsService>[]))
        _Service(s.label, _serviceTasks(s, health), _spots(s.cpu), _spots(s.mem)),
    ];

    // ── ALB ──
    final albReq = _spots(m?.albReq ?? const []);
    final albP99 = _spots(m?.albP99 ?? const []);

    // ── Aurora ──
    final aurCpu = _spots(m?.aurCpu ?? const []);
    final aurAcu = _spots(m?.aurAcu ?? const []);
    final aurConn = _spots(m?.aurConn ?? const []);
    final aurMem = _spots(m?.aurMem ?? const []);

    // ── 활성 알람 (실데이터) ──
    final alarms = <_Alarm>[
      for (final a in (m?.alarms ?? const <OpsAlarm>[]))
        _Alarm(
          sev: a.sev == 'critical' ? _Sev.critical : _Sev.warning,
          name: a.name,
          metric: a.metric,
          value: a.value,
          threshold: a.threshold,
          since: '실시간',
        ),
    ];

    final critCount = alarms.where((a) => a.sev == _Sev.critical).length;
    final warnCount = alarms.where((a) => a.sev == _Sev.warning).length;
    final overall =
        critCount > 0 ? _Sev.critical : (warnCount > 0 ? _Sev.warning : null);

    // 서비스 가동 수 (running/desired 또는 health 기반)
    var running = 0, desired = 0;
    for (final s in (m?.services ?? const <OpsService>[])) {
      desired += 1;
      if (_serviceUp(s, health)) running += 1;
    }

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: const EmonTopBar(current: 'dashboard'),
      floatingActionButton: FloatingActionButton(
        backgroundColor: _indigo,
        foregroundColor: Colors.white,
        onPressed: _refresh,
        child: const Icon(Icons.refresh),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // ① 헤더
            _HeaderCard(
              clock: _fmtClock(_updatedAt),
              onRefresh: _refresh,
            ),
            const SizedBox(height: 12),

            // ② KPI (2x2)
            _Card(
              title: '핵심 지표',
              child: GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: 8,
                crossAxisSpacing: 8,
                childAspectRatio: 1.7,
                children: [
                  _KpiCard(
                    icon: overall == null
                        ? Icons.verified_user_outlined
                        : Icons.warning_amber_rounded,
                    label: '시스템 종합 상태',
                    value: overall == null
                        ? '정상'
                        : (overall == _Sev.warning ? '주의' : '위험'),
                    tone: overall == null
                        ? _Tone.emerald
                        : (overall == _Sev.warning ? _Tone.amber : _Tone.red),
                  ),
                  _KpiCard(
                    icon: Icons.warning_amber_rounded,
                    label: '활성 알람',
                    value: '$critCount · $warnCount',
                    sub: 'Critical · Warning',
                    tone: critCount > 0
                        ? _Tone.red
                        : (warnCount > 0 ? _Tone.amber : _Tone.emerald),
                  ),
                  _KpiCard(
                    icon: Icons.dns_outlined,
                    label: '실행 중 태스크',
                    value: '$running/$desired',
                    sub: 'ECS Running / Desired',
                    tone: running < desired ? _Tone.red : _Tone.indigo,
                  ),
                  _KpiCard(
                    icon: Icons.speed_outlined,
                    label: 'ALB p99 응답',
                    value: '${_last(albP99)}s',
                    sub: '임계 3s',
                    tone: _Tone.blue,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ③ 활성 알람
            _Card(
              title: '활성 알람',
              child: Column(
                children: [
                  for (final a in alarms)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 6),
                      child: _AlarmRow(a),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ④ ECS 서비스
            _Card(
              title: 'ECS 서비스',
              subtitle: 'Fargate · CPU / Memory / Tasks',
              child: Column(
                children: [
                  for (var i = 0; i < services.length; i++) ...[
                    _ServiceRow(services[i], lineColor: _indigo),
                    if (i != services.length - 1)
                      const Divider(height: 16, color: AppColors.slate200),
                  ],
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ⑤ ALB · 트래픽
            _Card(
              title: 'ALB · 트래픽',
              subtitle: 'Application Load Balancer',
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _ChartLabel('요청 수 (RequestCount)',
                      '${_last(albReq).round()}/min'),
                  const SizedBox(height: 6),
                  SizedBox(
                    height: 140,
                    child: _lineChart(
                      [_LineSpec(albReq, _indigo)],
                      yWidth: 34,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.slate100,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: const Text(
                      '5xx 임계 10',
                      style:
                          TextStyle(fontSize: 11, color: AppColors.slate500),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ⑥ Aurora (2x2 mini)
            _Card(
              title: 'Aurora Serverless v2',
              subtitle: 'RDS · CPU / ACU / Connections / Memory',
              child: Column(
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: _MiniLine(
                            title: 'CPU 사용률',
                            unit: '%',
                            data: aurCpu,
                            color: _indigo,
                            last: _last(aurCpu)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _MiniLine(
                            title: '용량 (ACU)',
                            unit: '',
                            data: aurAcu,
                            color: _violet,
                            last: _last(aurAcu)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Expanded(
                        child: _MiniLine(
                            title: 'DB 커넥션',
                            unit: '',
                            data: aurConn,
                            color: _blue,
                            last: _last(aurConn)),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: _MiniLine(
                            title: '가용 메모리',
                            unit: 'MB',
                            data: aurMem,
                            color: _emerald,
                            last: _last(aurMem)),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // ⑦ AI 모달 서비스 상태 (/ops/health 실연동)
            _Card(
              title: 'AI 모달 서비스 상태',
              child: Row(
                children: [
                  for (final k in const ['ECG', 'CXR', 'LAB'])
                    Expanded(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 3),
                        child: _ModalHealthChip(
                          label: k,
                          up: health[k] ?? false,
                          known: health.containsKey(k),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),

            // 하단 노트
            Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8),
                child: Text(
                  loading
                      ? 'ⓘ CloudWatch 연동 — 데이터 불러오는 중…'
                      : 'ⓘ CloudWatch 실시간 연동 (/ops/metrics · /ops/health · 20초 폴링)',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: AppColors.slate400),
                ),
              ),
            ),
            const SizedBox(height: 12),
          ],
        ),
      ),
    );
  }

  // ── fl_chart 빌더들 ──

  /// 라인 차트 — 여러 시리즈 지원. subtle grid + 작은 axis 텍스트.
  Widget _lineChart(List<_LineSpec> specs, {double yWidth = 30}) {
    double minY = double.infinity, maxY = -double.infinity;
    for (final s in specs) {
      for (final p in s.spots) {
        minY = math.min(minY, p.y);
        maxY = math.max(maxY, p.y);
      }
    }
    if (minY == double.infinity) {
      minY = 0;
      maxY = 1;
    }
    final pad = (maxY - minY) * 0.15 + 0.001;

    return LineChart(
      LineChartData(
        minY: minY - pad,
        maxY: maxY + pad,
        lineTouchData: const LineTouchData(enabled: false),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => const FlLine(
            color: AppColors.slate200,
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: yWidth,
              getTitlesWidget: (value, meta) => Text(
                value % 1 == 0
                    ? value.toInt().toString()
                    : value.toStringAsFixed(1),
                style: const TextStyle(
                    fontSize: 9, color: AppColors.slate400),
              ),
            ),
          ),
          bottomTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
        ),
        lineBarsData: [
          for (final s in specs)
            LineChartBarData(
              spots: s.spots,
              color: s.color,
              barWidth: 2,
              isCurved: true,
              dotData: const FlDotData(show: false),
              belowBarData: BarAreaData(
                show: true,
                color: s.color.withValues(alpha: 0.12),
              ),
            ),
        ],
      ),
    );
  }

  /// 막대 차트 — 모달별 에러 (값 ≥3이면 red, 아니면 violet).
  Widget _barChart(List<_BarDatum> data) {
    var maxV = 3.0;
    for (final d in data) {
      maxV = math.max(maxV, d.value.toDouble());
    }
    return BarChart(
      BarChartData(
        maxY: maxV + 1,
        minY: 0,
        barTouchData: BarTouchData(enabled: false),
        gridData: FlGridData(
          show: true,
          drawVerticalLine: false,
          getDrawingHorizontalLine: (_) => const FlLine(
            color: AppColors.slate200,
            strokeWidth: 1,
          ),
        ),
        borderData: FlBorderData(show: false),
        titlesData: FlTitlesData(
          topTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          rightTitles:
              const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          leftTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 28,
              getTitlesWidget: _intAxisLabel,
            ),
          ),
          bottomTitles: AxisTitles(
            sideTitles: SideTitles(
              showTitles: true,
              reservedSize: 22,
              getTitlesWidget: (value, meta) {
                final i = value.toInt();
                if (i < 0 || i >= data.length) return const SizedBox.shrink();
                return Padding(
                  padding: const EdgeInsets.only(top: 4),
                  child: Text(
                    data[i].label,
                    style: const TextStyle(
                        fontSize: 10, color: AppColors.slate400),
                  ),
                );
              },
            ),
          ),
        ),
        barGroups: [
          for (var i = 0; i < data.length; i++)
            BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: data[i].value.toDouble(),
                  color: data[i].value >= 3 ? _red : _violet,
                  width: 22,
                  borderRadius: const BorderRadius.vertical(
                      top: Radius.circular(3)),
                ),
              ],
            ),
        ],
      ),
    );
  }

  static Widget _intAxisLabel(double value, TitleMeta meta) {
    if (value % 1 != 0) return const SizedBox.shrink();
    return Text(
      value.toInt().toString(),
      style: const TextStyle(fontSize: 9, color: AppColors.slate400),
    );
  }
}

// ════════════════ 데이터 모델 ════════════════

enum _Sev { critical, warning }

enum _Tone { emerald, amber, red, blue, indigo }

class _Service {
  final String label;
  final String tasks;
  final List<FlSpot> cpu;
  final List<FlSpot> mem;
  _Service(this.label, this.tasks, this.cpu, this.mem);
}

class _Alarm {
  final _Sev sev;
  final String name;
  final String metric;
  final String value;
  final String threshold;
  final String since;
  _Alarm({
    required this.sev,
    required this.name,
    required this.metric,
    required this.value,
    required this.threshold,
    required this.since,
  });
}

class _BarDatum {
  final String label;
  final int value;
  _BarDatum(this.label, this.value);
}

class _LineSpec {
  final List<FlSpot> spots;
  final Color color;
  _LineSpec(this.spots, this.color);
}

// ════════════════ UI 컴포넌트 ════════════════

/// worklist 스타일 흰 카드 — slate300 border, radius 4, padding 12,
/// 14-bold slate900 헤더 + 옵션 subtitle.
class _Card extends StatelessWidget {
  final String title;
  final String? subtitle;
  final Widget child;
  const _Card({required this.title, this.subtitle, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate300),
        borderRadius: BorderRadius.circular(4),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.bold,
                color: AppColors.slate900),
          ),
          if (subtitle != null) ...[
            const SizedBox(height: 2),
            Text(
              subtitle!,
              style:
                  const TextStyle(fontSize: 11, color: AppColors.slate400),
            ),
          ],
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

/// 헤더 줄: 제목 + 운영팀 전용 + 마지막 갱신 시각 + 새로고침 버튼.
class _HeaderCard extends StatelessWidget {
  final String clock;
  final VoidCallback onRefresh;
  const _HeaderCard({required this.clock, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate300),
        borderRadius: BorderRadius.circular(4),
      ),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Icon(Icons.dns_rounded, size: 20, color: AppColors.brand600),
              const SizedBox(width: 8),
              const Text(
                '운영 모니터링',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                    color: AppColors.slate900),
              ),
              const Spacer(),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.brand50,
                  borderRadius: BorderRadius.circular(4),
                ),
                child: const Text(
                  '운영팀 전용',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.bold,
                      color: AppColors.brand700),
                ),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              const Icon(Icons.schedule,
                  size: 13, color: AppColors.slate400),
              const SizedBox(width: 4),
              Text(
                '$clock 갱신',
                style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.slate500,
                    fontFeatures: [FontFeature.tabularFigures()]),
              ),
              const Spacer(),
              OutlinedButton.icon(
                onPressed: onRefresh,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('새로고침'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.slate700,
                  side: const BorderSide(color: AppColors.slate300),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 12, vertical: 6),
                  textStyle: const TextStyle(
                      fontSize: 12, fontWeight: FontWeight.bold),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(6)),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// 부드러운 컬러 KPI 카드.
class _KpiCard extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;
  final String? sub;
  final _Tone tone;
  const _KpiCard({
    required this.icon,
    required this.label,
    required this.value,
    this.sub,
    required this.tone,
  });

  ({Color bg, Color border, Color text, Color icon}) get _palette {
    switch (tone) {
      case _Tone.emerald:
        return (
          bg: AppColors.emerald50,
          border: AppColors.emerald300,
          text: AppColors.emerald700,
          icon: AppColors.emerald600,
        );
      case _Tone.amber:
        return (
          bg: AppColors.amber50,
          border: AppColors.amber300,
          text: AppColors.amber700,
          icon: AppColors.amber600,
        );
      case _Tone.red:
        return (
          bg: const Color(0xFFFEF2F2),
          border: const Color(0xFFFCA5A5),
          text: const Color(0xFFB91C1C),
          icon: AppColors.critical,
        );
      case _Tone.blue:
        return (
          bg: const Color(0xFFEFF6FF),
          border: const Color(0xFF93C5FD),
          text: const Color(0xFF1D4ED8),
          icon: const Color(0xFF3B82F6),
        );
      case _Tone.indigo:
        return (
          bg: AppColors.brand50,
          border: AppColors.brand200,
          text: AppColors.brand700,
          icon: AppColors.brand600,
        );
    }
  }

  @override
  Widget build(BuildContext context) {
    final p = _palette;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: p.bg,
        border: Border.all(color: p.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Row(
        children: [
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(
                      fontSize: 11, color: AppColors.slate500),
                ),
                const SizedBox(height: 4),
                Text(
                  value,
                  style: TextStyle(
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                      color: p.text,
                      fontFeatures: const [FontFeature.tabularFigures()]),
                ),
                if (sub != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(
                        fontSize: 10, color: AppColors.slate400),
                  ),
                ],
              ],
            ),
          ),
          Icon(icon, size: 22, color: p.icon),
        ],
      ),
    );
  }
}

/// 활성 알람 행 — soft amber/red.
class _AlarmRow extends StatelessWidget {
  final _Alarm a;
  const _AlarmRow(this.a);

  @override
  Widget build(BuildContext context) {
    final isCrit = a.sev == _Sev.critical;
    final bg = isCrit ? const Color(0xFFFEF2F2) : AppColors.amber50;
    final border = isCrit ? const Color(0xFFFCA5A5) : AppColors.amber300;
    final accent = isCrit ? AppColors.critical : AppColors.amber600;

    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.warning_amber_rounded, size: 14, color: accent),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  a.name,
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: AppColors.slate800,
                      fontFeatures: [FontFeature.tabularFigures()]),
                ),
              ),
              Text(
                a.since,
                style: const TextStyle(
                    fontSize: 11, color: AppColors.slate500),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            '${a.metric}  ·  현재 ${a.value}  ·  임계 ${a.threshold}',
            style: TextStyle(fontSize: 11, color: accent),
          ),
        ],
      ),
    );
  }
}

/// ECS 서비스 미니 행 — CPU/MEM 바 + 스파크라인.
class _ServiceRow extends StatelessWidget {
  final _Service s;
  final Color lineColor;
  const _ServiceRow(this.s, {required this.lineColor});

  double get _cpu => s.cpu.isEmpty ? 0 : s.cpu.last.y;
  double get _mem => s.mem.isEmpty ? 0 : s.mem.last.y;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          flex: 5,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      s.label,
                      style: const TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: AppColors.slate800),
                    ),
                  ),
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 6, vertical: 1),
                    decoration: BoxDecoration(
                      color: AppColors.emerald50,
                      borderRadius: BorderRadius.circular(3),
                    ),
                    child: Text(
                      s.tasks,
                      style: const TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                          color: AppColors.emerald700,
                          fontFeatures: [FontFeature.tabularFigures()]),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              _Bar(label: 'CPU', pct: _cpu, color: lineColor),
              const SizedBox(height: 4),
              _Bar(label: 'MEM', pct: _mem, color: AppColors.aiAccent),
            ],
          ),
        ),
        const SizedBox(width: 10),
        // 스파크라인 (cpu 시리즈)
        Expanded(
          flex: 3,
          child: SizedBox(
            height: 40,
            child: _SparklineHost(spots: s.cpu, color: lineColor),
          ),
        ),
      ],
    );
  }
}

/// CPU/MEM 작은 선형 바.
class _Bar extends StatelessWidget {
  final String label;
  final double pct; // 0..100
  final Color color;
  const _Bar({required this.label, required this.pct, required this.color});

  @override
  Widget build(BuildContext context) {
    final v = (pct.clamp(0, 100)) / 100.0;
    return Row(
      children: [
        SizedBox(
          width: 30,
          child: Text(
            label,
            style: const TextStyle(fontSize: 10, color: AppColors.slate400),
          ),
        ),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(3),
            child: LinearProgressIndicator(
              value: v,
              minHeight: 6,
              backgroundColor: AppColors.slate100,
              valueColor: AlwaysStoppedAnimation<Color>(color),
            ),
          ),
        ),
        const SizedBox(width: 6),
        SizedBox(
          width: 34,
          child: Text(
            '${pct.round()}%',
            textAlign: TextAlign.right,
            style: const TextStyle(
                fontSize: 10,
                color: AppColors.slate500,
                fontFeatures: [FontFeature.tabularFigures()]),
          ),
        ),
      ],
    );
  }
}

/// 스파크라인을 그리기 위해 State의 _sparkline을 재사용할 수 없으므로 자체 구현.
class _SparklineHost extends StatelessWidget {
  final List<FlSpot> spots;
  final Color color;
  const _SparklineHost({required this.spots, required this.color});

  @override
  Widget build(BuildContext context) {
    double minY = double.infinity, maxY = -double.infinity;
    for (final p in spots) {
      minY = math.min(minY, p.y);
      maxY = math.max(maxY, p.y);
    }
    if (minY == double.infinity) {
      minY = 0;
      maxY = 1;
    }
    final pad = (maxY - minY) * 0.15 + 0.001;
    return LineChart(
      LineChartData(
        minY: minY - pad,
        maxY: maxY + pad,
        lineTouchData: const LineTouchData(enabled: false),
        gridData: const FlGridData(show: false),
        borderData: FlBorderData(show: false),
        titlesData: const FlTitlesData(show: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            color: color,
            barWidth: 1.6,
            isCurved: true,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              color: color.withValues(alpha: 0.10),
            ),
          ),
        ],
      ),
    );
  }
}

/// Aurora 미니 라인 카드 — 제목 + 최신값 + 작은 라인 차트.
class _MiniLine extends StatelessWidget {
  final String title;
  final String unit;
  final List<FlSpot> data;
  final Color color;
  final double last;
  const _MiniLine({
    required this.title,
    required this.unit,
    required this.data,
    required this.color,
    required this.last,
  });

  @override
  Widget build(BuildContext context) {
    final valueStr = last % 1 == 0
        ? last.toInt().toString()
        : last.toStringAsFixed(1);
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: AppColors.slate50,
        border: Border.all(color: AppColors.slate200),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title,
            style: const TextStyle(fontSize: 11, color: AppColors.slate500),
          ),
          const SizedBox(height: 2),
          Text(
            unit.isEmpty ? valueStr : '$valueStr$unit',
            style: TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.bold,
                color: color,
                fontFeatures: const [FontFeature.tabularFigures()]),
          ),
          const SizedBox(height: 6),
          SizedBox(
            height: 44,
            child: _SparklineHost(spots: data, color: color),
          ),
        ],
      ),
    );
  }
}

/// 차트 위 작은 라벨 줄 (제목 + 값).
class _ChartLabel extends StatelessWidget {
  final String title;
  final String value;
  const _ChartLabel(this.title, this.value);

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.bold,
                color: AppColors.slate700),
          ),
        ),
        Text(
          value,
          style: const TextStyle(
              fontSize: 11,
              color: AppColors.slate500,
              fontFeatures: [FontFeature.tabularFigures()]),
        ),
      ],
    );
  }
}

/// 모달 서비스 상태 칩 — /ops/health 기반 정상/중단/확인 중.
class _ModalHealthChip extends StatelessWidget {
  final String label;
  final bool up;
  final bool known;
  const _ModalHealthChip(
      {required this.label, required this.up, required this.known});

  @override
  Widget build(BuildContext context) {
    final ok = known && up;
    final bg = !known
        ? AppColors.slate100
        : (ok ? AppColors.emerald50 : const Color(0xFFFEF2F2));
    final border = !known
        ? AppColors.slate300
        : (ok ? AppColors.emerald300 : const Color(0xFFFCA5A5));
    final fg = !known
        ? AppColors.slate500
        : (ok ? AppColors.emerald700 : AppColors.critical);
    final statusText = !known ? '확인 중' : (ok ? '정상' : '중단');
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Column(
        children: [
          Icon(
            ok
                ? Icons.check_circle
                : (known ? Icons.error_outline : Icons.help_outline),
            size: 18,
            color: fg,
          ),
          const SizedBox(height: 4),
          Text(label,
              style: const TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: AppColors.slate800)),
          const SizedBox(height: 2),
          Text(statusText,
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.bold, color: fg)),
        ],
      ),
    );
  }
}
