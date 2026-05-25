import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/api/patient_api.dart';
import '../../core/api/reports_api.dart';
import '../../core/models/ai_rec.dart';
import '../../shared/theme/app_theme.dart';
import '../../shared/widgets/emon_top_bar.dart';
import '../../shared/widgets/top_notification_banner.dart';

/// frontend/src/pages/v2/ReportEditorPage.tsx 와 동일 흐름 — 모바일 적응.
/// 2-stepper(소견 검토 → 소견 확정·EMR 전송) + 소견서 본문 + 소견 근거 자료 + 확정 버튼.
class ReportEditorPage extends ConsumerStatefulWidget {
  final String encounterId;
  const ReportEditorPage({super.key, required this.encounterId});

  @override
  ConsumerState<ReportEditorPage> createState() => _ReportEditorPageState();
}

/// RAG narrative를 소견서 본문 / 소견 근거 자료(RAG 참고 근거)로 분리·정리.
///  - 본문: 맨 위 헤더 제거(→"상기 인은"부터), [RAG 참고 근거] 섹션 제거,
///          "진료의 ○○○ ..." 푸터 제거 (소견서 양식에 자체 발행/서명란 있음).
///  - ragEvidence: [RAG 참고 근거] 섹션 텍스트 → 소견 근거 자료 패널에 표시.
/// 웹 ReportEditorPage.tsx 의 splitNarrative와 동일 로직.
({String body, String ragEvidence}) splitNarrative(String? raw) {
  var s = (raw ?? '').trim();
  if (s.isEmpty) return (body: '', ragEvidence: '');
  final start = s.indexOf('상기 인은');
  if (start > 0) s = s.substring(start);
  var ragEvidence = '';
  final ragStart = s.indexOf('[RAG 참고 근거');
  if (ragStart >= 0) {
    final after = s.substring(ragStart + 1);
    final nextRel = after.indexOf(RegExp(r'\n\[[^\]\n]+\]')); // 다음 [섹션] 헤더
    final ragEnd = nextRel >= 0 ? ragStart + 1 + nextRel : s.length;
    ragEvidence = s.substring(ragStart, ragEnd).trim();
    s = '${s.substring(0, ragStart).trimRight()}\n\n'
            '${s.substring(ragEnd).trimLeft()}'
        .trim();
  }
  final sig = RegExp(r'진료의\s*○○○').firstMatch(s);
  if (sig != null) s = s.substring(0, sig.start).trim();
  s = s.replaceAll(RegExp(r'[─-]{5,}\s*$'), '').trim();
  return (body: s, ragEvidence: ragEvidence);
}

class _ReportEditorPageState extends ConsumerState<ReportEditorPage> {
  late TextEditingController _editsController;
  bool _busy = false;
  bool _initializedEdits = false;
  bool _evidenceOpen = false; // 소견 근거 자료 토글

  @override
  void initState() {
    super.initState();
    _editsController = TextEditingController();
  }

  @override
  void dispose() {
    _editsController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(reportProvider(widget.encounterId));

    return Scaffold(
      backgroundColor: AppColors.slate50,
      appBar: EmonTopBar(current: 'report', patientId: widget.encounterId),
      body: async.when(
        loading: () => const _LoadingPanel('AI 종합소견서 생성 중…'),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('소견서 로딩 실패: $e',
                style: const TextStyle(color: AppColors.critical)),
          ),
        ),
        data: (report) {
          // 본문/근거 자료 분리 — 의사 수정본 우선, 없으면 RAG narrative를 정리.
          final split = splitNarrative(report.aiDiagnosis);
          final body = report.physicianEdits ?? split.body;
          final ragEvidence = split.ragEvidence;

          // 초기 본문 세팅 (한 번만)
          if (!_initializedEdits) {
            _editsController.text = body;
            _initializedEdits = true;
          }
          // 확정(signed) 전까지 본문 편집 가능 — 별도 검토 단계 없음(웹과 동일)
          final editable = report.status != 'signed' &&
              report.status != 'amended' &&
              !_busy;
          final canConfirm = editable;

          return Column(
            children: [
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.all(12),
                  children: [
                    _StatusStepper(status: report.status),
                    const SizedBox(height: 12),
                    // ── 소견 근거 자료 (토글) ──
                    _EvidenceToggle(
                      open: _evidenceOpen,
                      onTap: () =>
                          setState(() => _evidenceOpen = !_evidenceOpen),
                    ),
                    if (_evidenceOpen) ...[
                      const SizedBox(height: 8),
                      _EvidencePanel(
                        encounterId: widget.encounterId,
                        ragEvidence: ragEvidence,
                        similarCases: report.similarCases,
                        onClose: () => setState(() => _evidenceOpen = false),
                      ),
                    ],
                    const SizedBox(height: 8),
                    _ReportSheet(
                      controller: _editsController,
                      editable: editable,
                      status: report.status,
                    ),
                    const SizedBox(height: 12),
                    if (editable)
                      const _Hint(
                          '소견서 본문을 직접 수정한 뒤 아래 "소견 확정 · EMR 전송"을 누르면 확정·전송됩니다.'),
                    if (report.status == 'signed' ||
                        report.status == 'amended')
                      const _SignedNotice(),
                  ],
                ),
              ),
              _ActionBar(
                status: report.status,
                canConfirm: canConfirm,
                onConfirm: () => _doConfirm(report.id),
              ),
            ],
          );
        },
      ),
    );
  }

  // 소견 확정 & EMR 전송 — 백엔드 POST /reports/{id}/sign → status signed + FHIR final(EMR)
  Future<void> _doConfirm(int reportId) async {
    setState(() => _busy = true);
    try {
      await signReport(
        ref,
        reportId,
        signedBy: '정OO',
        physicianEdits: _editsController.text,
        encounterId: widget.encounterId,
      );
      if (!mounted) return;
      _showEmrDialog();
    } catch (e) {
      if (!mounted) return;
      TopNotificationBanner.show(context,
          title: '소견 확정 실패', body: '$e', critical: true);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _showEmrDialog() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(4)),
        title: Row(children: [
          Container(
            width: 36,
            height: 36,
            decoration: BoxDecoration(
                color: AppColors.emerald100,
                borderRadius: BorderRadius.circular(18)),
            child: const Icon(Icons.check_circle,
                color: AppColors.emerald600, size: 22),
          ),
          const SizedBox(width: 10),
          const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('EMR 전송 완료',
                  style:
                      TextStyle(fontSize: 14, fontWeight: FontWeight.bold)),
              SizedBox(height: 2),
              Text('소견서 서명 · 외부 EMR 연동',
                  style: TextStyle(fontSize: 10, color: AppColors.slate500)),
            ],
          ),
        ]),
        content: const Text(
          '소견서가 서명 완료 처리되었습니다.\n'
          'FHIR DiagnosticReport 상태가 final로 전이되어 외부 EMR로 전송되었습니다.',
          style:
              TextStyle(fontSize: 12, color: AppColors.slate700, height: 1.5),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('계속 보기'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.brand600,
                foregroundColor: Colors.white),
            onPressed: () {
              Navigator.pop(ctx);
              context.go('/worklist');
            },
            child: const Text('환자 목록으로'),
          ),
        ],
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// 상태 스테퍼 — 웹 STATUS_STEPS와 동일 (소견 검토 → 소견 확정·EMR 전송)
// ────────────────────────────────────────────────────────────
class _StatusStepper extends StatelessWidget {
  final String status;
  const _StatusStepper({required this.status});

  static const _steps = ['소견 검토', '소견 확정 · EMR 전송'];

  // 확정(signed/amended) 시 마지막 단계, 그 외(초안/검토)는 0단계 — 웹과 동일.
  int get _stepIdx =>
      (status == 'signed' || status == 'amended') ? 1 : 0;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: List.generate(_steps.length * 2 - 1, (i) {
        if (i.isOdd) {
          return const Text(' › ',
              style: TextStyle(
                  fontSize: 12,
                  color: AppColors.slate300,
                  fontWeight: FontWeight.bold));
        }
        final idx = i ~/ 2;
        final isPast = idx < _stepIdx;
        final isCurrent = idx == _stepIdx;
        final signed = status == 'signed' || status == 'amended';
        final (bg, fg) = isPast
            ? (AppColors.slate200, AppColors.slate500)
            : isCurrent
                ? (signed ? AppColors.emerald600 : AppColors.amber600,
                    Colors.white)
                : (AppColors.slate100, AppColors.slate400);
        return Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 7),
            decoration: BoxDecoration(
                color: bg, borderRadius: BorderRadius.circular(3)),
            child: Center(
              child: Text(
                '${idx + 1} ${_steps[idx]}',
                style: TextStyle(
                    fontSize: 11, fontWeight: FontWeight.bold, color: fg),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        );
      }),
    );
  }
}

// ────────────────────────────────────────────────────────────
// 소견 근거 자료 — 웹의 노란 포스트잇 토글 버튼
// ────────────────────────────────────────────────────────────
class _EvidenceToggle extends StatelessWidget {
  final bool open;
  final VoidCallback onTap;
  const _EvidenceToggle({required this.open, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: open ? AppColors.amber200 : AppColors.amber100,
          border: Border.all(
              color: open ? AppColors.amber300 : AppColors.amber200),
          borderRadius: BorderRadius.circular(3),
        ),
        child: Row(
          children: [
            const Icon(Icons.attach_file,
                size: 16, color: AppColors.slate600),
            const SizedBox(width: 6),
            const Text('소견 근거 자료',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.bold,
                    color: AppColors.amber900)),
            const Spacer(),
            Icon(open ? Icons.expand_less : Icons.expand_more,
                size: 18, color: AppColors.amber900),
          ],
        ),
      ),
    );
  }
}

// ────────────────────────────────────────────────────────────
// 소견 근거 자료 패널 — 모달 판독 카드 + RAG 참고 근거 + RAG 유사 사례
// 웹 ReportEditorPage.tsx 의 SourceEvidence 포팅.
// ────────────────────────────────────────────────────────────
class _EvidencePanel extends ConsumerWidget {
  final String encounterId;
  final String ragEvidence;
  final List<Map<String, dynamic>> similarCases;
  final VoidCallback onClose;
  const _EvidencePanel({
    required this.encounterId,
    required this.ragEvidence,
    required this.similarCases,
    required this.onClose,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(patientDetailProvider(encounterId));
    final modals = async.asData?.value.modalResults ?? const {};

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.amber50,
        border: Border.all(color: AppColors.amber200),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const Icon(Icons.attach_file,
                  size: 16, color: AppColors.amber700),
              const SizedBox(width: 6),
              const Text('소견 근거 자료',
                  style: TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.bold,
                      color: AppColors.amber900)),
              const Spacer(),
              InkWell(
                onTap: onClose,
                child: const Icon(Icons.close,
                    size: 16, color: AppColors.amber700),
              ),
            ],
          ),
          const SizedBox(height: 10),
          // ── AI 판독 결과 (모달별) ──
          if (modals.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('판독된 검사가 없습니다.',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 12, color: AppColors.slate400)),
            )
          else
            for (final m in ['ECG', 'CXR', 'LAB'])
              if (modals[m] != null) ...[
                _ModalCard(modality: m, modal: modals[m]!),
                const SizedBox(height: 6),
              ],
          // ── RAG 참고 근거 (본문에서 분리한 [RAG 참고 근거] 섹션) ──
          if (ragEvidence.isNotEmpty) ...[
            const SizedBox(height: 4),
            const _EvidenceLabel('RAG 참고 근거'),
            const SizedBox(height: 6),
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.amber100.withValues(alpha: 0.6),
                border: Border.all(color: AppColors.amber200),
                borderRadius: BorderRadius.circular(3),
              ),
              child: Text(
                ragEvidence.replaceFirst(
                    RegExp(r'^\[RAG 참고 근거[^\]]*\]\s*'), ''),
                style: const TextStyle(
                    fontSize: 12, height: 1.5, color: AppColors.slate700),
              ),
            ),
          ],
          // ── RAG 유사 사례 (백엔드 검색 결과) ──
          if (similarCases.isNotEmpty) ...[
            const SizedBox(height: 12),
            const _EvidenceLabel('RAG 유사 사례 (MIMIC 실제 검색)'),
            const SizedBox(height: 6),
            for (final c in similarCases) ...[
              _SimilarCaseCard(c: c),
              const SizedBox(height: 6),
            ],
          ],
        ],
      ),
    );
  }
}

class _EvidenceLabel extends StatelessWidget {
  final String text;
  const _EvidenceLabel(this.text);
  @override
  Widget build(BuildContext context) {
    return Text(text,
        style: const TextStyle(
            fontSize: 13,
            fontWeight: FontWeight.bold,
            color: AppColors.slate700));
  }
}

class _ModalCard extends StatelessWidget {
  final String modality;
  final ModalSummary modal;
  const _ModalCard({required this.modality, required this.modal});

  String get _label => switch (modality) {
        'ECG' => '심전도 12-Lead',
        'CXR' => '흉부 X-ray',
        _ => '혈액 검사',
      };

  @override
  Widget build(BuildContext context) {
    // CXR은 한국어로 재구성, 그 외는 summary 그대로 (웹과 동일).
    final text = modality == 'CXR'
        ? modal.cxrKoreanSummary
        : (modal.summary ?? '');
    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate200),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: const BoxDecoration(
              color: AppColors.slate50,
              border: Border(bottom: BorderSide(color: AppColors.slate200)),
            ),
            child: Row(
              children: [
                Text(modality,
                    style: const TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        color: AppColors.slate800)),
                const SizedBox(width: 6),
                Text(_label,
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.slate400)),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(10),
            child: Text(
              text.isEmpty ? '판독 결과 없음' : text,
              style: TextStyle(
                  fontSize: 12,
                  height: 1.5,
                  color: text.isEmpty
                      ? AppColors.slate400
                      : AppColors.slate700),
            ),
          ),
        ],
      ),
    );
  }
}

class _SimilarCaseCard extends StatelessWidget {
  final Map<String, dynamic> c;
  const _SimilarCaseCard({required this.c});

  @override
  Widget build(BuildContext context) {
    final chunkType = (c['chunk_type'] as String?)?.toUpperCase();
    final hadmId = c['hadm_id']?.toString();
    final sim = (c['similarity'] as num?)?.toDouble();
    final snippet = c['snippet'] as String?;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: AppColors.slate50,
        border: Border.all(color: AppColors.slate200),
        borderRadius: BorderRadius.circular(3),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  '${chunkType ?? 'CASE'}${hadmId != null ? ' · hadm $hadmId' : ''}',
                  style: const TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.bold,
                      color: AppColors.slate700),
                ),
              ),
              if (sim != null)
                Text('유사도 ${(sim * 100).round()}%',
                    style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.bold,
                        color: AppColors.brand600,
                        fontFeatures: [FontFeature.tabularFigures()])),
            ],
          ),
          if (snippet != null && snippet.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(snippet,
                style: const TextStyle(
                    fontSize: 12, height: 1.5, color: AppColors.slate600)),
          ],
        ],
      ),
    );
  }
}

// 소견서 양식 — 웹 ReportDocument를 단순화
class _ReportSheet extends StatelessWidget {
  final TextEditingController controller;
  final bool editable;
  final String status;
  const _ReportSheet({
    required this.controller,
    required this.editable,
    required this.status,
  });

  @override
  Widget build(BuildContext context) {
    final today = DateTime.now();
    final dateStr = '${today.year}.${today.month}.${today.day}';
    final signed = status == 'signed' || status == 'amended';
    final doctorName = signed ? '정OO' : '—';

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        border: Border.all(color: AppColors.slate400),
        borderRadius: BorderRadius.circular(2),
      ),
      child: Column(
        children: [
          // 제목
          Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: const BoxDecoration(
              border: Border(
                  bottom:
                      BorderSide(color: AppColors.slate400, width: 2)),
            ),
            child: const Column(
              children: [
                Text('소 견 서',
                    style: TextStyle(
                        fontSize: 22,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 8,
                        color: AppColors.slate900)),
                SizedBox(height: 4),
                Text('[ 원본대조필인 (印) ]',
                    style: TextStyle(
                        fontSize: 10, color: AppColors.critical)),
              ],
            ),
          ),
          // 소견서 내용 (편집 가능)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: const BoxDecoration(
              color: AppColors.slate100,
              border:
                  Border(bottom: BorderSide(color: AppColors.slate300)),
            ),
            child: Row(
              children: [
                const Text('소견서 내용',
                    style: TextStyle(
                        fontSize: 11,
                        fontWeight: FontWeight.bold,
                        color: AppColors.slate700)),
                const SizedBox(width: 8),
                if (editable)
                  const Text('✎ 편집 모드',
                      style: TextStyle(
                          fontSize: 10,
                          color: AppColors.brand600,
                          fontWeight: FontWeight.bold))
                else
                  const Text('읽기 전용 — 확정 완료',
                      style: TextStyle(
                          fontSize: 10, color: AppColors.slate400)),
              ],
            ),
          ),
          editable
              // 편집 모드 — 원본 마크다운을 그대로 보여주고 의사가 수정 가능
              ? Padding(
                  padding: const EdgeInsets.all(10),
                  child: TextField(
                    controller: controller,
                    maxLines: 16,
                    style: const TextStyle(
                        fontSize: 12,
                        height: 1.5,
                        color: AppColors.slate800),
                    decoration: const InputDecoration(
                      border: InputBorder.none,
                      contentPadding: EdgeInsets.zero,
                      isDense: true,
                    ),
                  ),
                )
              // 읽기 모드 — Bedrock 출력 마크다운 정식 렌더링
              : Padding(
                  padding: const EdgeInsets.all(10),
                  child: controller.text.isEmpty
                      ? const Text('AI 종합 소견 생성 중…',
                          style: TextStyle(
                              fontSize: 12,
                              height: 1.5,
                              color: AppColors.slate800))
                      : MarkdownBody(
                          data: controller.text,
                          shrinkWrap: true,
                          styleSheet: MarkdownStyleSheet(
                            p: const TextStyle(
                                fontSize: 12,
                                height: 1.55,
                                color: AppColors.slate800),
                            h1: const TextStyle(
                                fontSize: 16,
                                height: 1.4,
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate900),
                            h2: const TextStyle(
                                fontSize: 14,
                                height: 1.4,
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate900),
                            h3: const TextStyle(
                                fontSize: 13,
                                height: 1.4,
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate800),
                            strong: const TextStyle(
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate900),
                            em: const TextStyle(
                                fontStyle: FontStyle.italic),
                            blockquote: const TextStyle(
                                fontSize: 11,
                                color: AppColors.slate600,
                                fontStyle: FontStyle.italic),
                            blockquoteDecoration: const BoxDecoration(
                              color: AppColors.slate50,
                              border: Border(
                                left: BorderSide(
                                    color: AppColors.brand600, width: 3),
                              ),
                            ),
                            blockquotePadding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 4),
                            listBullet: const TextStyle(
                                fontSize: 12, color: AppColors.slate800),
                            code: const TextStyle(
                                fontSize: 11,
                                fontFamily: 'monospace',
                                backgroundColor: AppColors.slate100),
                            horizontalRuleDecoration: const BoxDecoration(
                              border: Border(
                                top: BorderSide(color: AppColors.slate300),
                              ),
                            ),
                          ),
                        ),
                ),
          // 발행
          Container(
            padding: const EdgeInsets.all(14),
            decoration: const BoxDecoration(
              border: Border(
                  top: BorderSide(color: AppColors.slate400, width: 2)),
            ),
            child: Column(
              children: [
                const Text('위 와 같 이 소 견 함',
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 4,
                        color: AppColors.slate800)),
                const SizedBox(height: 12),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('발행일 $dateStr',
                            style: const TextStyle(
                                fontSize: 11, color: AppColors.slate800)),
                        const Text('EMON Med® · 응급실 멀티모달 AI 진단 보조',
                            style: TextStyle(
                                fontSize: 9, color: AppColors.slate400)),
                      ],
                    ),
                    Row(
                      children: [
                        Text('의사 $doctorName',
                            style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.bold,
                                color: AppColors.slate800)),
                        const SizedBox(width: 6),
                        Container(
                          width: 32,
                          height: 32,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                              color: signed
                                  ? AppColors.critical
                                  : AppColors.slate300,
                              width: 2,
                              style: signed
                                  ? BorderStyle.solid
                                  : BorderStyle.none,
                            ),
                            color: Colors.transparent,
                          ),
                          child: Text(
                            '印',
                            style: TextStyle(
                                fontSize: 13,
                                fontWeight: FontWeight.bold,
                                color: signed
                                    ? AppColors.critical
                                    : AppColors.slate300),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ActionBar extends StatelessWidget {
  final String status;
  final bool canConfirm;
  final VoidCallback onConfirm;
  const _ActionBar({
    required this.status,
    required this.canConfirm,
    required this.onConfirm,
  });

  @override
  Widget build(BuildContext context) {
    final signed = status == 'signed' || status == 'amended';
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: const BoxDecoration(
        color: Colors.white,
        border: Border(top: BorderSide(color: AppColors.slate300)),
      ),
      child: SizedBox(
        height: 46,
        width: double.infinity,
        child: ElevatedButton(
          style: ElevatedButton.styleFrom(
            backgroundColor:
                canConfirm ? AppColors.brand600 : AppColors.slate200,
            foregroundColor:
                canConfirm ? Colors.white : AppColors.slate400,
            shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(8)),
          ),
          onPressed: canConfirm ? onConfirm : null,
          child: Text(signed ? '확정 완료' : '소견 확정 · EMR 전송',
              style: const TextStyle(
                  fontSize: 15, fontWeight: FontWeight.bold)),
        ),
      ),
    );
  }
}

class _SignedNotice extends StatelessWidget {
  const _SignedNotice();
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(top: 8),
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
          color: AppColors.emerald50,
          border: Border.all(color: AppColors.emerald300),
          borderRadius: BorderRadius.circular(4)),
      child: const Row(
        children: [
          Icon(Icons.check_circle, color: AppColors.emerald600, size: 16),
          SizedBox(width: 6),
          Text('소견 확정 완료 · EMR 전송됨',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.bold,
                  color: AppColors.emerald700)),
        ],
      ),
    );
  }
}

class _Hint extends StatelessWidget {
  final String text;
  const _Hint(this.text);
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
          color: AppColors.slate50,
          border: Border.all(color: AppColors.slate300),
          borderRadius: BorderRadius.circular(4)),
      child: Text(text,
          style: const TextStyle(fontSize: 11, color: AppColors.slate600)),
    );
  }
}

class _LoadingPanel extends StatelessWidget {
  final String message;
  const _LoadingPanel(this.message);
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const CircularProgressIndicator(strokeWidth: 2),
          const SizedBox(height: 12),
          Text(message,
              style:
                  const TextStyle(fontSize: 12, color: AppColors.slate500)),
        ],
      ),
    );
  }
}
