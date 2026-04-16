import type { Metadata } from 'next';
import { Inspector } from 'react-dev-inspector';
import './globals.css';
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: 'Seedance 2.0 视频生成工具',
    template: '%s | Seedance 2.0',
  },
  description: '基于 Seedance 2.0 的 AI 视频生成工具，支持项目管理、素材库和任务管理',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="antialiased">
        <Inspector query={{ __inspectorHref__: '/__inspect' }} />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
