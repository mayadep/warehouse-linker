import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 같은 네트워크의 다른 기기(폰 등)에서 개발 서버(http://<PC IP>:3000)로 접속 허용. PC IP가 바뀌면 여기에 추가
  allowedDevOrigins: ["192.168.200.105", "192.168.0.3"],
};

export default nextConfig;
