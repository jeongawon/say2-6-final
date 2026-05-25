import 'package:dio/dio.dart';

import 'client.dart';

/// 트리아지 제출 — 웹 submitTriage와 동일하게 백엔드 /triage/submit 호출.
/// encounter 생성 → 1차 AI 권고까지 트리거된다.

final _dio = Dio(BaseOptions(
  baseUrl: apiBaseUrl,
  connectTimeout: const Duration(seconds: 15),
  receiveTimeout: const Duration(seconds: 30),
  contentType: 'application/json',
));

// 주호소 한글 → CC Map 영문(초기 모달 라우팅용)
const _ccMap = <String, String>{
  '흉통': 'Chest Pain',
  '복통': 'Abdominal Pain',
  '호흡곤란': 'Dyspnea',
  '숨': 'Dyspnea',
  '두통': 'Headache',
  '발열': 'Fever',
  '열': 'Fever',
  '어지': 'Dizziness',
  '실신': 'Syncope',
};

// 과거력 한글 → 코드 (소견서 과거력 표기)
const _historyCode = <String, String>{
  '고혈압': 'HTN',
  '당뇨': 'DM',
  '관상동맥질환': 'CAD',
  '뇌졸중': 'Stroke',
  'COPD': 'COPD',
  '천식': 'Asthma',
  '만성신부전': 'CKD',
  '심방세동': 'AFIB',
};

// 데모 MIMIC 환자 — 실제 ECG/CXR S3 경로 (멀티모달 실판독)
const _demoMimic = <String, Map<String, String>>{
  '18230098': {
    'subject_id': '18230098',
    'cxr_image_path':
        's3://say1-pre-project-5/data/mimic-cxr-jpg/files/p18/p18230098/s58964529/ef582e36-fe63fc3f-a5d512ae-9e2828c0-88d3b59d.jpg',
    'ecg_record_path':
        's3://say2-6team/mimic/ecg/waveforms/files/p1823/p18230098/s46745774/46745774',
  },
};

class TriageResult {
  final String encounterId;
  final String? patientId;
  const TriageResult(this.encounterId, this.patientId);
}

double _num(String s, double fallback) => double.tryParse(s.trim()) ?? fallback;

Future<TriageResult> submitTriage({
  required String mrn,
  required String name,
  required int age,
  required String gender, // 'male' | 'female'
  required String complaint,
  required String hr,
  required String sbp,
  required String dbp,
  required String rr,
  required String spo2,
  required String bt,
  required Set<String> history,
}) async {
  // 주호소 영문 매핑 (없으면 원문)
  var ccText = complaint;
  for (final e in _ccMap.entries) {
    if (complaint.contains(e.key)) {
      ccText = e.value;
      break;
    }
  }

  final payload = <String, dynamic>{
    'patient': {
      'name': name,
      'age': age,
      'gender': gender == 'female' ? 'female' : 'male',
    },
    'vitals': {
      'hr': _num(hr, 80),
      'sbp': _num(sbp, 120),
      'dbp': _num(dbp, 80),
      'spo2': _num(spo2, 98),
      'rr': _num(rr, 18),
      'temp': _num(bt, 36.5),
      'gcs': 15,
    },
    'chief_complaint': {
      'text': ccText,
      'detail': complaint,
      'onset_minutes_ago': 0,
    },
    'past_history': [
      for (final h in history) {'text': _historyCode[h] ?? h},
    ],
    'mimic': _demoMimic[mrn] ?? {'subject_id': mrn},
  };

  final res = await _dio.post('/triage/submit', data: payload);
  final d = (res.data as Map).cast<String, dynamic>();
  return TriageResult(
    d['encounter_id'] as String,
    d['patient_id'] as String?,
  );
}
