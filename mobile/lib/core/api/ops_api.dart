import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'client.dart';

/// 운영 모니터링 — 백엔드 /ops/metrics + /ops/health 실연동(CloudWatch).
/// 웹 AdminDashboardPage와 동일 데이터 소스.

List<double> _series(dynamic raw) {
  // [{t,v}] 형태 → v 값만 추출
  if (raw is! List) return const [];
  return raw
      .whereType<Map>()
      .map((e) => (e['v'] as num?)?.toDouble() ?? 0.0)
      .toList(growable: false);
}

class OpsService {
  final String key;
  final String label;
  final int? running;
  final int? desired;
  final List<double> cpu;
  final List<double> mem;
  OpsService(this.key, this.label, this.running, this.desired, this.cpu, this.mem);

  factory OpsService.fromJson(Map<String, dynamic> j) => OpsService(
        j['key'] as String? ?? '',
        j['label'] as String? ?? '',
        (j['running'] as num?)?.toInt(),
        (j['desired'] as num?)?.toInt(),
        _series(j['cpu']),
        _series(j['mem']),
      );
}

class OpsAlarm {
  final String sev; // critical | warning
  final String name;
  final String metric;
  final String value;
  final String threshold;
  OpsAlarm(this.sev, this.name, this.metric, this.value, this.threshold);

  factory OpsAlarm.fromJson(Map<String, dynamic> j) => OpsAlarm(
        j['sev'] as String? ?? 'warning',
        j['name'] as String? ?? '',
        j['metric'] as String? ?? '',
        j['value']?.toString() ?? '',
        j['threshold']?.toString() ?? '',
      );
}

class OpsMetrics {
  final List<OpsService> services;
  final List<double> albReq;
  final List<double> albP99;
  final List<double> aurCpu;
  final List<double> aurAcu;
  final List<double> aurConn;
  final List<double> aurMem;
  final List<OpsAlarm> alarms;
  final Map<String, bool> health; // {ECG,CXR,LAB}
  OpsMetrics({
    required this.services,
    required this.albReq,
    required this.albP99,
    required this.aurCpu,
    required this.aurAcu,
    required this.aurConn,
    required this.aurMem,
    required this.alarms,
    required this.health,
  });
}

/// /ops/metrics + /ops/health 동시 조회 → 20초 폴링.
final opsMetricsProvider =
    StreamProvider.autoDispose<OpsMetrics>((ref) async* {
  final dio = ref.watch(dioProvider);
  while (true) {
    try {
      final results = await Future.wait([
        dio.get('/ops/metrics'),
        dio.get('/ops/health'),
      ]);
      final m = (results[0].data as Map).cast<String, dynamic>();
      final h = (results[1].data as Map).cast<String, dynamic>();
      final alb = (m['alb'] as Map?)?.cast<String, dynamic>() ?? {};
      final aur = (m['aurora'] as Map?)?.cast<String, dynamic>() ?? {};
      yield OpsMetrics(
        services: ((m['services'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => OpsService.fromJson(e.cast<String, dynamic>()))
            .toList(),
        albReq: _series(alb['req']),
        albP99: _series(alb['p99']),
        aurCpu: _series(aur['cpu']),
        aurAcu: _series(aur['acu']),
        aurConn: _series(aur['conn']),
        aurMem: _series(aur['mem']),
        alarms: ((m['alarms'] as List?) ?? [])
            .whereType<Map>()
            .map((e) => OpsAlarm.fromJson(e.cast<String, dynamic>()))
            .toList(),
        health: {
          'ECG': h['ECG'] == true,
          'CXR': h['CXR'] == true,
          'LAB': h['LAB'] == true,
        },
      );
    } catch (_) {
      // 네트워크 실패 시 빈 메트릭 (UI는 '연결 대기' 표시)
      yield OpsMetrics(
        services: const [], albReq: const [], albP99: const [],
        aurCpu: const [], aurAcu: const [], aurConn: const [], aurMem: const [],
        alarms: const [], health: const {},
      );
    }
    await Future.delayed(const Duration(seconds: 20));
  }
});
