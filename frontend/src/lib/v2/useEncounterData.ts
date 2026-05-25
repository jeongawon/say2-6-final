import { useCallback, useEffect, useRef, useState } from "react";
import {
  getModalResults, getServiceRequests, parseRecommendations,
  type ModalResults, type AIRec,
} from "./api";
import { subscribeEncounter } from "./ws";

export type WsStatus = "open" | "close" | "error" | null;

/* ─────────────────────────────────────────────────────────
   encounter 단위 모달 결과 + AI 권고(service-requests) 폴링 훅.
   AI 분석 / AI 결과 두 페이지가 공유한다.
   - WebSocket push + 10초 폴링 fallback
   - 세 모달(ECG/CXR/LAB) 결과가 모두 도착하면 인터벌 자동 정지
   ───────────────────────────────────────────────────────── */
export function useEncounterData(encounterId: string | null) {
  const [modalResults, setModalResults] = useState<ModalResults | null>(null);
  const [recs, setRecs] = useState<AIRec[]>([]);
  const [wsStatus, setWsStatus] = useState<WsStatus>(null);
  // 중앙 서버 REST 도달 여부 — 마지막 폴링이 응답받으면 true. (WebSocket 상태와 별개)
  const [serverOk, setServerOk] = useState(true);
  // 백엔드가 '다음 검사 권고를 더 보낼 예정'인지 — WebSocket 신호 기준(HAPI 검색 지연과 무관).
  //   next_proposal/order_placed/initial_proposals → true (아직 올 검사 있음)
  //   ready_for_report → false (더 없음)
  // '모든 권장 검사 완료' 배너를 이 신호로 게이팅해, 2차 권고가 도착하기 전 잠깐 뜨는 플래시를 막는다.
  const [pendingNext, setPendingNext] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!encounterId) return;
    const [mr, srList] = await Promise.all([
      getModalResults(encounterId),
      getServiceRequests(encounterId),
    ]);
    // 둘 중 하나라도 응답하면 서버 정상(REST 도달). 둘 다 null이면 다운으로 간주.
    setServerOk(mr !== null || srList !== null);
    if (mr) setModalResults(mr);
    if (srList) setRecs(parseRecommendations(srList));
    if (mr && mr.CXR && mr.ECG && mr.LAB && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [encounterId]);

  useEffect(() => {
    if (!encounterId) return;
    // WS 이벤트 직후 burst 재조회 — 방금 생성된 2차 권고 SR이 HAPI 검색에 인덱싱되는
    // 지연(수 초)을 흡수해, 10초 폴링을 기다리지 않고 1~3.5초 내에 화면에 뜨게 한다.
    const burstTimers: ReturnType<typeof setTimeout>[] = [];
    const burstPoll = () => {
      poll();
      burstTimers.push(setTimeout(poll, 1500));
      burstTimers.push(setTimeout(poll, 3500));
    };
    poll();
    const handle = subscribeEncounter(
      encounterId,
      (msg) => {
        const ev = msg?.event;
        if (ev === "ready_for_report") setPendingNext(false);
        else if (ev === "next_proposal" || ev === "order_placed" || ev === "initial_proposals" || ev === "modal_started") {
          setPendingNext(true);
        }
        burstPoll();
      },
      (s) => {
        setWsStatus(s);
        // (재)연결 시 pendingNext 초기화 — 끊긴 동안 놓친 ready_for_report로 배너가
        // 영영 숨는 것을 방지. 진짜 대기 중이면 recs(draft/active)가 다시 가린다.
        if (s === "open") setPendingNext(false);
      },
    );
    // WebSocket이 운영(CloudFront /ws 미라우팅)에서 안 붙어 실시간 푸시가 없으므로
    // 폴링 주기를 짧게(3초) 둬, 2차 권고·모달 결과가 준비되는 즉시 화면에 반영되게 한다.
    // (세 모달 결과가 모두 도착하면 poll() 내부에서 인터벌 자동 정지.)
    pollRef.current = setInterval(poll, 3_000);
    return () => {
      handle.close();
      burstTimers.forEach(clearTimeout);
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [encounterId, poll]);

  return { modalResults, recs, wsStatus, serverOk, pendingNext, poll };
}
