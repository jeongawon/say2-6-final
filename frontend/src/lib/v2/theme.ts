import { useEffect, useState } from "react";

/* ─────────────────────────────────────────────────────────
   다크모드 토글 — <html>에 .dark 클래스 부여 (Tailwind darkMode:"class")
   localStorage에 사용자 선택 유지.
   ───────────────────────────────────────────────────────── */
const KEY = "say6-theme";

function apply(dark: boolean) {
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
}

export function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY) === "dark";
  });

  useEffect(() => {
    apply(dark);
    localStorage.setItem(KEY, dark ? "dark" : "light");
  }, [dark]);

  return { dark, toggle: () => setDark((d) => !d) };
}
