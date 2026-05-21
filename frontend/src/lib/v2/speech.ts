import { useCallback, useEffect, useRef, useState } from "react";

/* ─────────────────────────────────────────────────────────
   Web Speech API 음성 인식 훅 (브라우저 내장 STT, 한국어 ko-KR)
   - Chrome/Edge 지원, Safari 부분 지원, Firefox 미지원
   - AWS 불필요 · 프론트엔드 단독 동작
   ───────────────────────────────────────────────────────── */

// 표준 타입이 lib.dom에 없어 최소 형태만 선언
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};
type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
};

function getCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechRecognition(lang = "ko-KR") {
  const [supported] = useState(() => getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const recRef = useRef<SpeechRecognitionLike | null>(null);

  const stop = useCallback(() => {
    recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    // 기존 인스턴스 정리
    recRef.current?.abort();

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalChunk += r[0].transcript;
        else interimChunk += r[0].transcript;
      }
      if (finalChunk) setTranscript((prev) => (prev ? prev + " " : "") + finalChunk.trim());
      setInterim(interimChunk);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    rec.onerror = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    setTranscript("");
    setInterim("");
    rec.start();
    setListening(true);
  }, [lang]);

  const reset = useCallback(() => {
    setTranscript("");
    setInterim("");
  }, []);

  useEffect(() => () => recRef.current?.abort(), []);

  return { supported, listening, transcript, interim, start, stop, reset };
}
