

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/ai_rec.dart';
import 'client.dart';

/// 환자 인적사항 — 검사결과지 헤더와 CXR 이미지 URL용.
class PatientInfo {
  final String? subjectId;     // MIMIC subject_id → /assets/cxr/{subjectId}
  final String? name;
  final int? age;
  final String sex;            // 'M' / 'F'
  final String? chiefComplaint;
  final String? riskLevel;     // 'routine' / 'urgent' / 'critical'
  const PatientInfo({
    this.subjectId,
    this.name,
    this.age,
    this.sex = 'M',
    this.chiefComplaint,
    this.riskLevel,
  });

  factory PatientInfo.fromJson(Map<String, dynamic> j) {
    final gender = (j['patient_gender'] as String?)?.toLowerCase();
    return PatientInfo(
      subjectId: j['subject_id']?.toString(),
      name: j['patient_name'] as String?,
      age: (j['patient_age'] as num?)?.toInt(),
      sex: (gender == 'female' || gender == 'f') ? 'F' : 'M',
      chiefComplaint: j['chief_complaint'] as String?,
      riskLevel: j['ai_risk_level'] as String?,
    );
  }
}

/// 환자 상세 — AI 권고 + 모달 결과 + 환자 인적사항 함께.
/// 단일 화면이 셋 다 필요하므로 한 번의 watch로 병렬 fetch.
class PatientDetailData {
  final List<AIRec> recommendations;
  final Map<String, ModalSummary> modalResults; // key: 'ECG'/'CXR'/'LAB'
  final PatientInfo patient;
  const PatientDetailData({
    required this.recommendations,
    required this.modalResults,
    required this.patient,
  });
}

final patientDetailProvider = FutureProvider.autoDispose
    .family<PatientDetailData, String>((ref, encounterId) async {
  final dio = ref.watch(dioProvider);

  // 세 endpoint 병렬 호출
  final results = await Future.wait([
    dio.get('/encounters/$encounterId/service-requests'),
    dio.get('/encounters/$encounterId/modal-results'),
    dio.get('/encounters/$encounterId/patient-info'),
  ]);

  // 1) ServiceRequest 파싱
  final srList = (results[0].data as List).cast<Map<String, dynamic>>();
  final recs = srList
      .map(AIRec.fromFhir)
      .where((r) => r != null)
      .cast<AIRec>()
      .toList()
    ..sort((a, b) => a.authoredOn.compareTo(b.authoredOn));

  // 2) modal-results 파싱 — raw JSON도 함께 보존 (검사결과지에서 활용)
  final mrData = (results[1].data as Map<String, dynamic>);
  final mrResults = (mrData['results'] as Map?) ?? const {};
  final modalMap = <String, ModalSummary>{};
  for (final m in ['ECG', 'CXR', 'LAB']) {
    final entry = mrResults[m] as Map?;
    if (entry == null) continue;
    modalMap[m] = ModalSummary(
      modality: m,
      status: entry['status'] as String? ?? 'unknown',
      summary: entry['summary'] as String?,
      raw: Map<String, dynamic>.from(entry),
    );
  }

  // 3) 환자 인적사항 (실패해도 화면은 그려져야 함)
  PatientInfo patient = const PatientInfo();
  try {
    final pi = (results[2].data as Map<String, dynamic>);
    patient = PatientInfo.fromJson(pi);
  } catch (_) {/* fallback to empty PatientInfo */}

  return PatientDetailData(
    recommendations: recs,
    modalResults: modalMap,
    patient: patient,
  );
});

/// AI 권고 승인 — POST /orders/{sr_id}/approve.
/// 성공 시 patientDetailProvider invalidate해서 새로고침.
Future<void> approveOrder(WidgetRef ref, String srId, String encounterId) async {
  final dio = ref.read(dioProvider);
  await dio.post('/orders/$srId/approve');
  // 약간 지연 후 새로고침 — 백엔드가 모달 호출 시작할 시간 확보
  await Future.delayed(const Duration(milliseconds: 400));
  ref.invalidate(patientDetailProvider(encounterId));
}

/// 의사 직접 오더 — POST /orders/request. AI 권고와 무관하게 모달 실행.
/// 웹의 PatientDetailPage.tsx 의 requestOrder() 와 동일 동작.
Future<void> requestOrder(
  WidgetRef ref, {
  required String encounterId,
  required String patientId,
  required String modality, // 'ECG' / 'CXR' / 'LAB'
}) async {
  final dio = ref.read(dioProvider);
  await dio.post('/orders/request', data: {
    'encounter_id': encounterId,
    'patient_id': patientId,
    'modality': modality,
    'reason': '의사 직접 오더: $modality',
    'priority': 'routine',
  });
  await Future.delayed(const Duration(milliseconds: 400));
  ref.invalidate(patientDetailProvider(encounterId));
}



