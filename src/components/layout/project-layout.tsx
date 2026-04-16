"use client";

import { useState, createContext, useContext, ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Video, FolderOpen, ListTodo, Settings, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose } from "lucide-react";

interface ProjectLayoutContextType {
  projectId: string | null;
  projectName: string | null;
  setProjectId: (id: string | null) => void;
  setProjectName: (name: string | null) => void;
}

const ProjectLayoutContext = createContext<ProjectLayoutContextType>({
  projectId: null,
  projectName: null,
  setProjectId: () => {},
  setProjectName: () => {},
});

export const useProjectLayout = () => useContext(ProjectLayoutContext);

interface ProjectLayoutProps {
  children: ReactNode;
}

export function ProjectLayout({ children }: ProjectLayoutProps) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [materialsDrawerOpen, setMaterialsDrawerOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { href: projectId ? `/projects/${projectId}` : "#", icon: Video, label: "视频生成", disabled: !projectId },
    { href: projectId ? `/projects/${projectId}/materials` : "#", icon: FolderOpen, label: "素材库", disabled: !projectId },
    { href: projectId ? `/projects/${projectId}/tasks` : "#", icon: ListTodo, label: "任务管理", disabled: !projectId },
  ];

  const isActive = (href: string) => {
    if (href === "#") return false;
    return pathname === href || pathname.startsWith(href + "/");
  };

  return (
    <ProjectLayoutContext.Provider value={{ projectId, projectName, setProjectId, setProjectName }}>
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
            <span className={cn("font-semibold text-lg", collapsed && "hidden")}>Seedance 2.0</span>
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
                  isActive(item.href) && "bg-primary text-primary-foreground",
                  !item.disabled && "hover:bg-accent",
                  item.disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                <item.icon className="w-5 h-5 flex-shrink-0" />
                <span className={cn(collapsed && "hidden")}>{item.label}</span>
              </Link>
            ))}
          </nav>

          {/* 底部设置 */}
          <div className="p-2 border-t">
            <Link
              href="/projects"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors"
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <span className={cn(collapsed && "hidden")}>项目管理</span>
            </Link>
          </div>
        </aside>

        {/* 素材库抽屉触发按钮 */}
        {projectId && (
          <button
            onClick={() => setMaterialsDrawerOpen(!materialsDrawerOpen)}
            className={cn(
              "fixed right-0 top-1/2 -translate-y-1/2 z-40 p-2 bg-primary text-primary-foreground rounded-l-lg shadow-lg transition-transform hover:bg-primary/90",
              materialsDrawerOpen && "translate-x-72"
            )}
          >
            {materialsDrawerOpen ? (
              <PanelRightClose className="w-5 h-5" />
            ) : (
              <PanelRightOpen className="w-5 h-5" />
            )}
          </button>
        )}

        {/* 主内容区 */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </ProjectLayoutContext.Provider>
  );
}
