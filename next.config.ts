import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // 빌드 시 TypeScript 타입 에러가 있어도 무시하고 배포 진행
    ignoreBuildErrors: true,
  },
  eslint: {
    // 빌드 시 ESLint 문법 에러가 있어도 무시하고 배포 진행
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
