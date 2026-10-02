import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 네트워크의 다른 기기에서 개발 서버(http://192.168.200.105:3000)로 접속 허용
  allowedDevOrigins: ["192.168.200.105"],
};

export default nextConfig;
