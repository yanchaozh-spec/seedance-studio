"use client";

import { useState, createContext, useContext, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Video, FolderOpen, ListTodo, Settings, ChevronLeft, ChevronRight, Sun, Moon } from "lucide-react";
import { useTheme } from "next-themes";

interface ProjectLayoutContextType {
  projectId: string | null;
  projectName: string | null;
  setProjectId: (id: string | null) => void;
  setProjectName: (name: string | null) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
}

const ProjectLayoutContext = createContext<ProjectLayoutContextType>({
  projectId: null,
  projectName: null,
  setProjectId: () => {},
  setProjectName: () => {},
  settingsOpen: false,
  setSettingsOpen: () => {},
});

export const useProjectLayout = () => useContext(ProjectLayoutContext);

interface ProjectLayoutProps {
  children: ReactNode;
}

// 首页布局（无左侧导航）
export function ProjectLayout({ children }: ProjectLayoutProps) {
  return <>{children}</>;
}

// 项目内布局（有左侧导航）
export function ProjectDetailLayout({ children }: ProjectLayoutProps) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  // 从 URL 中提取 projectId
  const pathParts = pathname.split("/");
  const currentProjectId = pathParts[2]; // /projects/[id]/...

  const navItems = [
    { href: `/projects/${currentProjectId}`, icon: Video, label: "视频生成", exact: true },
    { href: `/projects/${currentProjectId}/materials`, icon: FolderOpen, label: "素材库" },
    { href: `/projects/${currentProjectId}/tasks`, icon: ListTodo, label: "任务管理" },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <ProjectLayoutContext.Provider value={{ projectId, projectName, setProjectId, setProjectName, settingsOpen, setSettingsOpen }}>
      <div className="flex h-screen bg-background">
        {/* 左侧导航 */}
        <aside
          className={cn(
            "flex flex-col border-r bg-card transition-all duration-300",
            collapsed ? "w-16" : "w-52"
          )}
        >
          {/* Logo */}
          <div className="flex items-center h-14 px-4 border-b">
            <Link href="/projects">
              <span className={cn("font-semibold text-lg", collapsed && "hidden")}>Seedance 2.0</span>
            </Link>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="ml-auto p-1.5 hover:bg-accent rounded-md transition-colors"
            >
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>

          {/* 导航项 */}
          <nav className="flex-1 p-2 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                  isActive(item.href, item.exact) && "bg-primary text-primary-foreground",
                  !isActive(item.href, item.exact) && "hover:bg-accent"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className={cn(collapsed && "hidden")}>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* 底部按钮 */}
          <div className="p-2 border-t space-y-1">
            {/* 主题切换 */}
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors w-full"
            >
              {theme === "dark" ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />}
              <span className={cn(collapsed && "hidden")}>{theme === "dark" ? "浅色模式" : "深色模式"}</span>
            </button>

            {/* 设置 */}
            <Link
              href={`/projects/${currentProjectId}/settings`}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors",
                isActive(`/projects/${currentProjectId}/settings`) && "bg-primary text-primary-foreground",
                !isActive(`/projects/${currentProjectId}/settings`) && "hover:bg-accent"
              )}
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <span className={cn(collapsed && "hidden")}>设置</span>
            </Link>
          </div>
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </ProjectLayoutContext.Provider>
  );
}
