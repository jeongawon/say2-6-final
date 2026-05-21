import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// 백엔드(오케스트레이터) 프록시 타깃.
// - 로컬 개발: 기본값 http://localhost:8000
// - ECS 배포 백엔드로 붙을 때: .env 에 VITE_PROXY_TARGET=https://<ECS-ALB-DNS> 지정
//   (예: VITE_PROXY_TARGET=https://say2-6team-alb-xxxx.ap-northeast-2.elb.amazonaws.com)
// prod 빌드(S3/CloudFront)는 same-origin 상대경로 + ALB 라우팅을 사용하므로 프록시 불필요.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_PROXY_TARGET || "http://localhost:8000";
  const wsTarget = target.replace(/^http/, "ws");

  // 오케스트레이터/모달/리포트 등 백엔드 경로 — 전부 동일 타깃(ECS ALB 또는 로컬)
  const apiRoutes = [
    "/predict", "/health", "/ready",       // ML 추론(레거시 직결 + ECS)
    "/mimic", "/triage/submit",            // 트리아지
    "/encounters", "/orders", "/reports",  // v2 진료 플로우
    "/assets", "/devices",
  ];
  const proxy: Record<string, { target: string; changeOrigin: boolean; ws?: boolean }> = {};
  for (const r of apiRoutes) proxy[r] = { target, changeOrigin: true };
  // WebSocket — backend ws.py /ws/encounter/{id}
  proxy["/ws"] = { target: wsTarget, ws: true, changeOrigin: true };

  return {
    plugins: [react()],
    server: {
      port: 3000,
      // localtunnel/ngrok/cloudflare 외부 호스트 허용 (Figma plugin 등)
      allowedHosts: [".loca.lt", ".trycloudflare.com", ".ngrok-free.app", ".ngrok.app"],
      proxy,
    },
  };
});
