import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // 빌드 중 타입 에러가 발생해도 빌드를 강제 통과시킵니다.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
