"use client";

import { useEffect } from "react";

/** 서비스워커 등록 (앱 설치·오프라인 안내용). 지원하지 않거나 http 환경이면 조용히 건너뛴다 */
export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
  }, []);
  return null;
}
