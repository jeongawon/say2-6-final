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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    if (!encounterId) return;
    const [mr, srList] = await Promise.all([
      getModalResults(encounterId),
      getServiceRequests(encounterId),
    ]);
    if (mr) setModalResults(mr);
    if (srList) setRecs(parseRecommendations(srList));
    if (mr && mr.CXR && mr.ECG && mr.LAB && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [encounterId]);

  useEffect(() => {
    if (!encounterId) return;
    poll();
    const handle = subscribeEncounter(encounterId, () => poll(), (s) => setWsStatus(s));
    pollRef.current = setInterval(poll, 10_000);
    return () => {
      handle.close();
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [encounterId, poll]);

  return { modalResults, recs, wsStatus, poll };
}
