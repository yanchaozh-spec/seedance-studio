"use client";

import { useEffect, useState, createContext, useContext, ReactNode, use } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Video, FolderOpen, ListTodo, Settings, ChevronLeft, PanelRightOpen, PanelRightClose, X } from "lucide-react";
import { getProject, Project } from "@/lib/projects";
import { useProjectLayout } from "@/components/layout/project-layout";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Asset, getAssets } from "@/lib/assets";
import { Image, Music } from "lucide-react";
import { useDraggable } from "@/hooks/use-draggable";

interface ProjectDetailContextType {
  project: Project | null;
  loading: boolean;
  selectedAssets: Asset[];
  setSelectedAssets: React.Dispatch<React.SetStateAction<Asset[]>>;
  addAssetToPool: (asset: Asset) => void;
  removeAssetFromPool: (assetId: string) => void;
  clearPool: () => void;
}

const ProjectDetailContext = createContext<ProjectDetailContextType>({
  project: null,
  loading: true,
  selectedAssets: [],
  setSelectedAssets: () => {},
  addAssetToPool: () => {},
  removeAssetFromPool: () => {},
  clearPool: () => {},
});

export const useProjectDetail = () => useContext(ProjectDetailContext);

interface DraggableAssetProps {
  asset: Asset;
  onDragStart?: (asset: Asset) => void;
  showRemove?: boolean;
  onRemove?: (assetId: string) => void;
}

function DraggableAsset({ asset, onDragStart, showRemove, onRemove }: DraggableAssetProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: asset.id,
    data: asset,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: isDragging ? 50 : undefined,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={cn(
        "relative group bg-muted rounded-lg overflow-hidden cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50"
      )}
    >
      {asset.type === "image" ? (
        <div className="w-20 h-20">
          {asset.thumbnail_url ? (
            <img
              src={asset.thumbnail_url}
              alt={asset.name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <Image className="w-8 h-8 text-muted-foreground" />
            </div>
          )}
          {asset.bound_audio_id && (
            <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-1 rounded">
              <Music className="w-3 h-3" />
            </div>
          )}
        </div>
      ) : (
        <div className="w-20 h-20 flex flex-col items-center justify-center bg-muted">
          <Music className="w-8 h-8 text-muted-foreground" />
          <span className="text-xs text-muted-foreground mt-1 truncate w-full text-center px-1">
            {asset.display_name || asset.name}
          </span>
        </div>
      )}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
        <span className="text-xs text-white truncate block">
          {asset.display_name || asset.name}
        </span>
      </div>
      {showRemove && onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(asset.id);
          }}
          className="absolute top-1 left-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

interface ProjectDetailLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default function ProjectDetailLayout({ children, params }: ProjectDetailLayoutProps) {
  const resolvedParams = use(params);
  const { projectId, projectName, setProjectId, setProjectName } = useProjectLayout();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [materialsDrawerOpen, setMaterialsDrawerOpen] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);
  const [materials, setMaterials] = useState<Asset[]>([]);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    loadProject();
  }, [resolvedParams.id]);

  useEffect(() => {
    if (project) {
      setProjectId(project.id);
      setProjectName(project.name);
    }
  }, [project, setProjectId, setProjectName]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const data = await getProject(resolvedParams.id);
      setProject(data);
      // 加载素材
      const assets = await getAssets(resolvedParams.id);
      setMaterials(assets);
    } catch (error) {
      console.error("加载项目失败:", error);
      router.push("/projects");
    } finally {
      setLoading(false);
    }
  };

  const addAssetToPool = (asset: Asset) => {
    setSelectedAssets((prev) => {
      if (prev.find((a) => a.id === asset.id)) return prev;
      // 生成显示名称
      const sameType = prev.filter((a) => a.type === asset.type);
      const prefix = asset.type === "image" ? "图" : "音频";
      const displayName = `${prefix}${sameType.length + 1}`;
      return [...prev, { ...asset, display_name: displayName }];
    });
  };

  const removeAssetFromPool = (assetId: string) => {
    setSelectedAssets((prev) => prev.filter((a) => a.id !== assetId));
  };

  const clearPool = () => {
    setSelectedAssets([]);
  };

  const navItems = [
    { href: `/projects/${resolvedParams.id}`, icon: Video, label: "视频生成", exact: true },
    { href: `/projects/${resolvedParams.id}/materials`, icon: FolderOpen, label: "素材库" },
    { href: `/projects/${resolvedParams.id}/tasks`, icon: ListTodo, label: "任务管理" },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const imageMaterials = materials.filter((m) => m.type === "image");
  const audioMaterials = materials.filter((m) => m.type === "audio");

  return (
    <ProjectDetailContext.Provider
      value={{
        project,
        loading,
        selectedAssets,
        setSelectedAssets,
        addAssetToPool,
        removeAssetFromPool,
        clearPool,
      }}
    >
      <div className="flex h-[calc(100vh-3.5rem)]">
        {/* 左侧导航 */}
        <aside className="w-48 border-r bg-card p-2 space-y-1">
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
              <span>{item.label}</span>
            </Link>
          ))}
        </aside>

        {/* 主内容区 */}
        <main className="flex-1 overflow-auto">{children}</main>

        {/* 素材库抽屉 */}
        <Sheet open={materialsDrawerOpen} onOpenChange={setMaterialsDrawerOpen}>
          <SheetContent className="w-80 sm:max-w-[400px] p-0" side="right">
            <SheetHeader className="p-4 border-b">
              <div className="flex items-center justify-between">
                <SheetTitle>素材库</SheetTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/projects/${resolvedParams.id}/materials`)}
                >
                  完整素材库 →
                </Button>
              </div>
            </SheetHeader>
            <div className="flex-1 overflow-auto p-4">
              {/* 图片素材 */}
              {imageMaterials.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    图片素材 ({imageMaterials.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {imageMaterials.map((asset) => (
                      <DraggableAsset
                        key={asset.id}
                        asset={asset}
                        onDragStart={() => addAssetToPool(asset)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 音频素材 */}
              {audioMaterials.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    音频素材 ({audioMaterials.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {audioMaterials.map((asset) => (
                      <DraggableAsset
                        key={asset.id}
                        asset={asset}
                        onDragStart={() => addAssetToPool(asset)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {materials.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="w-12 h-12 mx-auto mb-3" />
                  <p>暂无素材</p>
                  <p className="text-sm">请先上传素材</p>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* 素材库抽屉触发按钮 */}
        <button
          onClick={() => setMaterialsDrawerOpen(!materialsDrawerOpen)}
          className={cn(
            "fixed right-0 top-1/2 -translate-y-1/2 z-40 p-2 bg-primary text-primary-foreground rounded-l-lg shadow-lg transition-transform hover:bg-primary/90",
            materialsDrawerOpen && "translate-x-[380px]"
          )}
        >
          {materialsDrawerOpen ? (
            <PanelRightClose className="w-5 h-5" />
          ) : (
            <PanelRightOpen className="w-5 h-5" />
          )}
        </button>
      </div>
    </ProjectDetailContext.Provider>
  );
}
