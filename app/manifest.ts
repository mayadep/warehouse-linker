import type { MetadataRoute } from "next";

// 폰·PDA 홈 화면에 설치하는 현장용 앱 (시작 화면 = 모바일 허브)
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "재고관리 현장",
    short_name: "재고관리",
    description: "입고 검수, 출고, 재고 조회, 재고 실사를 스캔으로 처리하는 현장용 화면",
    start_url: "/m",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#315eea",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
