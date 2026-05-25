import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'client.dart';

class ReportData {
  final int id;
  final String encounterId;
  final String? subjectId;
  final String? patientName;
  final String? chiefComplaint;
  final String status; // preliminary / reviewed / signed / amended
  final String? aiDiagnosis;
  final String? physicianEdits;
  final String? signedBy;
  final String? aiRiskLevel;
  final DateTime? createdAt;
  final DateTime? signedAt;
  /// RAG 유사 사례 — generate 응답의 similar_cases (소견 근거 자료에 표시).
  /// 기존 소견서 조회(by-encounter)에는 없을 수 있어 기본 빈 리스트.
  final List<Map<String, dynamic>> similarCases;

  const ReportData({
    required this.id,
    required this.encounterId,
    required this.status,
    this.subjectId,
    this.patientName,
    this.chiefComplaint,
    this.aiDiagnosis,
    this.physicianEdits,
    this.signedBy,
    this.aiRiskLevel,
    this.createdAt,
    this.signedAt,
    this.similarCases = const [],
  });

  factory ReportData.fromJson(Map<String, dynamic> j) => ReportData(
        id: (j['id'] as num).toInt(),
        encounterId: j['encounter_id'] as String,
        subjectId: j['subject_id'] as String?,
        patientName: j['patient_name'] as String?,
        chiefComplaint: j['chief_complaint'] as String?,
        status: j['status'] as String,
        aiDiagnosis: j['ai_diagnosis'] as String?,
        physicianEdits: j['physician_edits'] as String?,
        signedBy: j['signed_by'] as String?,
        aiRiskLevel: j['ai_risk_level'] as String?,
        createdAt: DateTime.tryParse(j['created_at'] as String? ?? ''),
        signedAt: DateTime.tryParse(j['signed_at'] as String? ?? ''),
        similarCases: ((j['similar_cases'] as List?) ?? const [])
            .map((e) => Map<String, dynamic>.from(e as Map))
            .toList(),
      );
}

/// /reports/list — 알림 패널이 사용. 3초 간격 갱신.
/// generate 직후 [ref.invalidate(reportsListProvider)]를 호출하면 즉시 재요청 시작.
final reportsListProvider =
    StreamProvider.autoDispose<List<ReportData>>((ref) async* {
  final dio = ref.watch(dioProvider);
  while (true) {
    try {
      final res = await dio.get('/reports/list');
      final list = (res.data as List)
          .cast<Map<String, dynamic>>()
          .map(ReportData.fromJson)
          .toList();
      yield list;
    } catch (_) {
      yield <ReportData>[];
    }
    await Future<void>.delayed(const Duration(seconds: 3));
  }
});

/// 소견서 로딩 — 없으면 generate.
final reportProvider = FutureProvider.autoDispose
    .family<ReportData, String>((ref, encounterId) async {
  final dio = ref.watch(dioProvider);

  // 1) 기존 소견서 조회
  final getRes = await dio.get('/reports/by-encounter/$encounterId');
  if (getRes.data != null) {
    return ReportData.fromJson(getRes.data as Map<String, dynamic>);
  }

  // 2) 없으면 generate
  final genRes = await dio.post('/reports/$encounterId/generate');
  final data = genRes.data as Map<String, dynamic>;
  // generate는 ReportData와 약간 다른 shape: {report_id, status, narrative, ...}
  // 알림 패널이 새 preliminary를 즉시 잡도록 invalidate 후 재폴링 트리거.
  ref.invalidate(reportsListProvider);
  return ReportData(
    id: (data['report_id'] as num).toInt(),
    encounterId: encounterId,
    status: (data['status'] as String?) ?? 'preliminary',
    aiDiagnosis: data['narrative'] as String?,
    similarCases: ((data['similar_cases'] as List?) ?? const [])
        .map((e) => Map<String, dynamic>.from(e as Map))
        .toList(),
  );
});

Future<void> reviewReport(WidgetRef ref, int reportId,
    {String? physicianEdits, required String encounterId}) async {
  final dio = ref.read(dioProvider);
  await dio.patch('/reports/$reportId/review',
      data: {'physician_edits': physicianEdits});
  ref.invalidate(reportProvider(encounterId));
}

Future<void> signReport(WidgetRef ref, int reportId,
    {required String signedBy,
    String? physicianEdits,
    required String encounterId}) async {
  final dio = ref.read(dioProvider);
  await dio.post('/reports/$reportId/sign', data: {
    'signed_by': signedBy,
    'physician_edits': physicianEdits,
  });
  ref.invalidate(reportProvider(encounterId));
}
