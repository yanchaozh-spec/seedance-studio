import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Tauri 打包：standalone 模式输出独立 Node.js server
  output: 'standalone',
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
