"use client";

import { useEffect, useState, createContext, useContext, ReactNode, use, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Video, FolderOpen, ListTodo, Settings, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose, X, Scissors, Image, Music, Film, Sun, Moon, Eye, Download, Camera, XCircle, Clock, Loader, CheckCircle, Sparkles, Coins, AlertCircle } from "lucide-react";
import { getProject, Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Asset, getAssets } from "@/lib/assets";
import { Task, getTasks, TaskStatus } from "@/lib/tasks";
import { useDraggable } from "@/hooks/use-draggable";
import { useTheme } from "next-themes";
import { useSettingsStore } from "@/lib/settings";
import { useDragStore } from "@/lib/drag-store";
import { formatDistanceToNow } from "date-fns";
import { SelectedAsset } from "./page";
import { toast } from "sonner";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { AssetCard } from "@/components/asset-card";
import { SettingsDialog } from "@/components/settings/SettingsDialog";

interface ProjectDetailContextType {
  project: Project | null;
  loading: boolean;
  selectedAssets: SelectedAsset[];
  setSelectedAssets: React.Dispatch<React.SetStateAction<SelectedAsset[]>>;
  materials: Asset[];
  setMaterials: React.Dispatch<React.SetStateAction<Asset[]>>;
  addAssetToPool: (asset: Asset) => void;
  removeAssetFromPool: (assetId: string) => void;
  clearPool: () => void;
  toggleAssetActivation: (assetId: string) => void;
}

const ProjectDetailContext = createContext<ProjectDetailContextType>({
  project: null,
  loading: true,
  selectedAssets: [],
  setSelectedAssets: () => {},
  materials: [],
  setMaterials: () => {},
  addAssetToPool: () => {},
  removeAssetFromPool: () => {},
  clearPool: () => {},
  toggleAssetActivation: () => {},
});

export const useProjectDetail = () => useContext(ProjectDetailContext);

interface DraggableAssetProps {
  asset: Asset;
  showRemove?: boolean;
  onRemove?: (assetId: string) => void;
  onClick?: (asset: Asset) => void;
  size?: "small" | "large";
  hideLabel?: boolean;
}

function DraggableAsset({ asset, showRemove, onRemove, onClick, size = "small", hideLabel }: DraggableAssetProps) {
  const setDragging = useDragStore((state) => state.setDragging);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    // 阻止点击事件冒泡到拖拽
    e.preventDefault();
    e.stopPropagation();
    if (onClick && (asset.type === "image" || asset.type === "keyframe")) {
      onClick(asset);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    // 开始拖拽时设置状态
    setDragging(true, asset.id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/json", JSON.stringify(asset));
    e.dataTransfer.setData("text/plain", JSON.stringify(asset));

    // 设置自定义拖拽图片（使用缩略图）
    if (asset.thumbnail_url && imageRef.current) {
      // 创建临时 canvas 来绘制缩略图
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        // 绘制背景
        ctx.fillStyle = "#1f2937";
        ctx.fillRect(0, 0, 80, 80);
        // 绘制图片（模拟）
        ctx.drawImage(imageRef.current, 0, 0, 80, 80);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const img = document.createElement("img");
            img.onload = () => {
              e.dataTransfer.setDragImage(img, 40, 40);
              URL.revokeObjectURL(url);
            };
            img.src = url;
          }
        });
      }
    } else if (asset.type === "audio") {
      // 音频使用图标作为拖拽图片
      const canvas = document.createElement("canvas");
      canvas.width = 80;
      canvas.height = 80;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#1f2937";
        ctx.fillRect(0, 0, 80, 80);
        ctx.fillStyle = "#ffffff";
        ctx.font = "40px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🎵", 40, 40);
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const img = document.createElement("img");
            img.onload = () => {
              e.dataTransfer.setDragImage(img, 40, 40);
              URL.revokeObjectURL(url);
            };
            img.src = url;
          }
        });
      }
    }
  };

  const handleDragEnd = () => {
    // 拖拽结束时重置状态
    setDragging(false);
  };

  // 处理点击事件，用于打开详情对话框
  const handleCardClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onClick && (asset.type === "image" || asset.type === "keyframe")) {
      onClick(asset);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onClick={handleCardClick}
      className={cn(
        "relative group bg-muted rounded-lg overflow-hidden cursor-grab active:cursor-grabbing select-none",
        (asset.type === "image" || asset.type === "keyframe") && onClick && "cursor-pointer hover:ring-2 hover:ring-primary transition-all",
        size === "small" ? "w-24" : "w-full"
      )}
    >
      {/* 隐藏的图片元素用于拖拽 */}
      {asset.thumbnail_url && (
        <img
          ref={imageRef}
          src={asset.thumbnail_url}
          alt=""
          className="hidden"
          crossOrigin="anonymous"
        />
      )}
      {asset.type === "image" || asset.type === "keyframe" ? (
        <div className="w-full">
          <div className={cn(
            "relative",
            size === "small" ? "aspect-square" : "aspect-video"
          )}>
            {asset.thumbnail_url ? (
              <img
                src={asset.thumbnail_url}
                alt={asset.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-muted">
                <Image className={cn(size === "small" ? "w-6 h-6" : "w-8 h-8", "text-muted-foreground")} />
              </div>
            )}
            {/* 删除按钮 */}
            {showRemove && onRemove && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onRemove(asset.id);
                }}
                className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className={size === "small" ? "w-2 h-2" : "w-3 h-3"} />
              </button>
            )}
          </div>
          {/* 底部信息 - 非隐藏时显示 */}
          {!hideLabel && (
            <div className={cn("space-y-1", size === "small" ? "p-1" : "p-2")}>
              {/* 音频参考按钮 - 仅美术资产显示 */}
              {asset.asset_category !== "keyframe" && (
                <div className={cn(
                  "flex items-center justify-center gap-1 rounded text-xs",
                  asset.bound_audio_id 
                    ? "bg-primary text-primary-foreground" 
                    : "bg-muted-foreground/20 text-muted-foreground",
                  size === "small" ? "py-0.5 px-1 text-[10px]" : "py-1"
                )}>
                  <Music className={size === "small" ? "w-2 h-2" : "w-3 h-3"} />
                  <span>{asset.bound_audio_id ? "有" : "无"}声音</span>
                </div>
              )}
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
    </div>
  );
}

// 设置弹窗组件
// 使用公共组件 SettingsDialog

interface ProjectDetailLayoutProps {
  children: ReactNode;
  params: Promise<{ id: string }>;
}

export default function ProjectDetailLayoutInner({ children, params }: ProjectDetailLayoutProps) {
  const resolvedParams = use(params);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"materials" | "tasks">("materials");
  const [materialFilter, setMaterialFilter] = useState<"all" | "keyframe" | "image">("all");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [materials, setMaterials] = useState<Asset[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [selectedDetailAsset, setSelectedDetailAsset] = useState<Asset | null>(null);
  const [selectedTaskDetail, setSelectedTaskDetail] = useState<Task | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    loadProject();
  }, [resolvedParams.id]);

  const loadProject = async () => {
    try {
      setLoading(true);
      const data = await getProject(resolvedParams.id);
      setProject(data);
      const assets = await getAssets(resolvedParams.id);
      setMaterials(assets);
    } catch (error) {
      console.error("加载项目失败:", error);
      router.push("/projects");
    } finally {
      setLoading(false);
    }
  };

  // 格式化时间
  const formatSeconds = (seconds: number | undefined | null) => {
    if (!seconds) return "-";
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  // 加载素材列表
  const loadMaterials = async () => {
    try {
      const assets = await getAssets(resolvedParams.id);
      setMaterials(assets);
    } catch (error) {
      console.error("加载素材失败:", error);
    }
  };

  // 加载任务列表
  const loadTasks = async () => {
    try {
      setLoadingTasks(true);
      const data = await getTasks(resolvedParams.id);
      setTasks(data);
    } catch (error) {
      console.error("加载任务失败:", error);
    } finally {
      setLoadingTasks(false);
    }
  };

  // 打开右侧抽屉
  const openDrawer = (tab: "materials" | "tasks") => {
    setActiveTab(tab);
    setRightDrawerOpen(true);
    if (tab === "tasks") {
      loadTasks();
    }
  };

  // 关闭右侧抽屉
  const closeDrawer = () => {
    setRightDrawerOpen(false);
  };

  const addAssetToPool = (asset: Asset) => {
    setSelectedAssets((prev) => {
      if (prev.find((a) => a.id === asset.id)) return prev;
      // 图片和关键帧默认激活，音频不激活
      const isActivated = asset.type !== "audio";
      // 保留原始 display_name 或 name，不生成"图1"这种格式
      return [...prev, { ...asset, isActivated }];
    });
  };

  const removeAssetFromPool = (assetId: string) => {
    setSelectedAssets((prev) => prev.filter((a) => a.id !== assetId));
  };

  const clearPool = () => {
    setSelectedAssets([]);
  };

  const toggleAssetActivation = (assetId: string) => {
    setSelectedAssets((prev) =>
      prev.map((a) => (a.id === assetId ? { ...a, isActivated: !a.isActivated } : a))
    );
  };

  const navItems = [
    { href: `/projects/${resolvedParams.id}`, icon: Video, label: "视频生成", exact: true },
    { href: `/projects/${resolvedParams.id}/long-video`, icon: Film, label: "长视频", exact: true },
    { href: `/projects/${resolvedParams.id}/materials`, icon: FolderOpen, label: "素材库" },
    { href: `/projects/${resolvedParams.id}/tasks`, icon: ListTodo, label: "任务管理" },
  ];

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  };

  const imageMaterials = materials.filter((m) => m.type !== "audio" && (m.asset_category === "image" || !m.asset_category));
  const keyframeMaterials = materials.filter((m) => m.asset_category === "keyframe");

  // 根据筛选条件获取显示的素材
  const getFilteredAssets = () => {
    if (materialFilter === "all") {
      return { image: imageMaterials, keyframe: keyframeMaterials };
    } else if (materialFilter === "keyframe") {
      return { image: [], keyframe: keyframeMaterials };
    } else {
      return { image: imageMaterials, keyframe: [] };
    }
  };
  const filtered = getFilteredAssets();

  return (
    <ProjectDetailContext.Provider
      value={{
        project,
        loading,
        selectedAssets,
        setSelectedAssets,
        materials,
        setMaterials,
        addAssetToPool,
        removeAssetFromPool,
        clearPool,
        toggleAssetActivation,
      }}
    >
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
            <Link href="/projects" className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-gradient-to-br from-neutral-800 to-neutral-600 dark:from-neutral-200 dark:to-neutral-400 flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white dark:text-neutral-900" fill="currentColor">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <span className={cn("font-semibold text-sm", collapsed && "hidden")}>焱超</span>
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
              <span className={cn(collapsed && "hidden")}>{theme === "dark" ? "浅色" : "深色"}</span>
            </button>

            {/* 设置按钮 */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors w-full"
            >
              <Settings className="w-5 h-5 flex-shrink-0" />
              <span className={cn(collapsed && "hidden")}>设置</span>
            </button>
          </div>
        </aside>

        {/* 主内容区 + 右侧常驻面板 */}
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-auto">{children}</main>

          {/* 右侧常驻面板（素材库 + 任务管理） */}
          <aside className="w-72 border-l bg-card flex flex-col">
            {/* 标签页切换 */}
            <div className="p-3 border-b">
              <div className="flex gap-1.5">
                <Button
                  variant={activeTab === "materials" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1 text-xs h-8"
                  onClick={() => setActiveTab("materials")}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  素材库
                </Button>
                <Button
                  variant={activeTab === "tasks" ? "default" : "outline"}
                  size="sm"
                  className="flex-1 gap-1 text-xs h-8"
                  onClick={() => {
                    setActiveTab("tasks");
                    loadTasks();
                  }}
                >
                  <ListTodo className="w-3.5 h-3.5" />
                  任务管理
                </Button>
              </div>
            </div>
            
            <div className="flex-1 overflow-auto p-4">
              {/* 素材库内容 */}
              {activeTab === "materials" && (
                <>
                  <Tabs value={materialFilter} onValueChange={(v) => setMaterialFilter(v as typeof materialFilter)} className="mb-3">
                    <TabsList className="w-full h-8">
                      <TabsTrigger value="all" className="flex-1 text-xs">全部</TabsTrigger>
                      <TabsTrigger value="keyframe" className="flex-1 text-xs">关键帧</TabsTrigger>
                      <TabsTrigger value="image" className="flex-1 text-xs">美术</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {filtered.image.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                        <Image className="w-3 h-3" />
                        {filtered.image.map((asset, idx) => (
                          <span key={asset.id}>
                            {asset.display_name || asset.name}
                            {idx < imageMaterials.length - 1 && "、"}
                          </span>
                        ))}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {filtered.image.map((asset) => (
                          <DraggableAsset
                            key={asset.id}
                            asset={asset}
                            size="small"
                            onClick={setSelectedDetailAsset}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {filtered.keyframe.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                        <Scissors className="w-3 h-3" />
                        {filtered.keyframe.map((asset, idx) => (
                          <span key={asset.id}>
                            {asset.display_name || asset.name}
                            {idx < keyframeMaterials.length - 1 && "、"}
                          </span>
                        ))}
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {filtered.keyframe.map((asset) => (
                          <DraggableAsset
                            key={asset.id}
                            asset={asset}
                            size="small"
                            onClick={setSelectedDetailAsset}
                          />
                        ))}
                      </div>
                    </div>
                  )}


                  {(filtered.image.length + filtered.keyframe.length) === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <FolderOpen className="w-12 h-12 mx-auto mb-3" />
                      <p>暂无素材</p>
                      <p className="text-sm">请先上传素材</p>
                    </div>
                  )}
                </>
              )}

              {/* 任务管理内容 */}
              {activeTab === "tasks" && (
                <>
                  <div className="mb-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => router.push(`/projects/${resolvedParams.id}/tasks`)}
                    >
                      完整任务管理
                    </Button>
                  </div>
                  {loadingTasks ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Video className="w-12 h-12 mx-auto mb-3" />
                      <p>暂无任务</p>
                      <p className="text-sm">开始生成视频后将显示在这里</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.slice(0, 10).map((task) => (
                        <div key={task.id} className="bg-muted rounded-lg overflow-hidden">
                          {/* 水平布局：左侧视频 + 右侧信息 */}
                          <div className="flex">
                            {/* 左侧视频区域 */}
                            {task.status === "succeeded" && task.result?.video_url ? (
                              <div 
                                className="w-28 h-16 bg-black flex-shrink-0"
                              >
                                <video
                                  ref={(el) => {
                                    if (el) videoRefs.current.set(task.id, el);
                                  }}
                                  src={task.result.video_url}
                                  controls
                                  className="w-full h-full object-contain"
                                  preload="metadata"
                                />
                              </div>
                            ) : task.status === "running" ? (
                              <div className="w-28 h-16 bg-muted-foreground/10 flex items-center justify-center flex-shrink-0">
                                <Loader className="w-5 h-5 animate-spin text-blue-500" />
                              </div>
                            ) : task.status === "failed" ? (
                              <div className="w-28 h-16 bg-muted-foreground/10 flex items-center justify-center flex-shrink-0">
                                <XCircle className="w-5 h-5 text-red-500" />
                              </div>
                            ) : (
                              <div className="w-28 h-16 bg-muted-foreground/10 flex items-center justify-center flex-shrink-0">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                              </div>
                            )}
                            
                            {/* 右侧详情区域 */}
                            <div className="flex-1 p-1.5 min-w-0 flex flex-col justify-between">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-muted-foreground font-mono truncate">
                                  {task.id.slice(0, 8)}...
                                </span>
                                <span className={cn("text-xs font-medium flex-shrink-0 ml-1", 
                                  task.status === "succeeded" ? "text-green-500" :
                                  task.status === "running" ? "text-blue-500" :
                                  task.status === "failed" ? "text-red-500" : "text-muted-foreground"
                                )}>
                                  {task.status === "succeeded" ? "已完成" :
                                   task.status === "running" ? "生成中" :
                                   task.status === "failed" ? "失败" : "排队中"}
                                </span>
                              </div>
                              
                              {/* Token */}
                              {task.completion_tokens && (
                                <div className="text-xs text-yellow-600">
                                  {task.completion_tokens.toLocaleString()} tokens
                                </div>
                              )}
                              
                              {/* 操作按钮 */}
                              <div className="flex gap-1">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 gap-0.5 text-xs h-6 px-1"
                                  onClick={() => setSelectedTaskDetail(task)}
                                >
                                  <Eye className="w-2.5 h-2.5" />
                                  <span>详情</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 gap-0.5 text-xs h-6 px-1"
                                  onClick={() => {
                                    const video = videoRefs.current.get(task.id);
                                    if (!video) return;
                                    
                                    if (video.readyState < 2) {
                                      toast.error("视频尚未加载完成");
                                      return;
                                    }
                                    
                                    const canvas = document.createElement("canvas");
                                    canvas.width = video.videoWidth;
                                    canvas.height = video.videoHeight;
                                    
                                    const ctx = canvas.getContext("2d");
                                    if (!ctx) {
                                      toast.error("无法创建画布");
                                      return;
                                    }
                                    
                                    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                                    
                                    canvas.toBlob(async (blob) => {
                                      if (blob) {
                                        const formData = new FormData();
                                        formData.append("file", new File([blob], "frame.png", { type: "image/png" }));
                                        formData.append("projectId", resolvedParams.id);
                                        formData.append("taskId", task.id);
                                        formData.append("timestamp", video.currentTime.toString());
                                        formData.append("assetCategory", "keyframe");
                                        formData.append("name", `关键帧_${Date.now()}`);
                                        
                                        try {
                                          const res = await fetch("/api/assets/extract-frame", {
                                            method: "POST",
                                            body: formData,
                                          });
                                          
                                          if (res.ok) {
                                            toast.success("已保存为关键帧");
                                            loadMaterials?.();
                                          } else {
                                            toast.error("保存失败");
                                          }
                                        } catch (e) {
                                          toast.error("抽帧失败");
                                        }
                                      }
                                    }, "image/png");
                                  }}
                                >
                                  <Camera className="w-2.5 h-2.5" />
                                  <span>抽帧</span>
                                </Button>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="flex-1 gap-0.5 text-xs h-6 px-1"
                                  onClick={() => {
                                    const a = document.createElement("a");
                                    a.href = task.result?.video_url || "";
                                    a.download = `video-${task.id}.mp4`;
                                    a.click();
                                  }}
                                >
                                  <Download className="w-2.5 h-2.5" />
                                  <span>下载</span>
                                </Button>
                              </div>
                            </div>
                          </div>
                          
                          {/* 生成进度条 */}
                          {task.status === "running" && (
                            <div className="h-1 bg-muted-foreground/20">
                              <div 
                                className="h-full bg-blue-500 transition-all"
                                style={{ width: `${task.progress || 0}%` }}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {tasks.length > 10 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => router.push(`/projects/${resolvedParams.id}/tasks`)}
                        >
                          查看全部 {tasks.length} 个任务 →
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>

        {/* 设置弹窗 */}
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />

        {/* 素材详情对话框 */}
        <AssetDetailDialog
          asset={selectedDetailAsset}
          allAssets={[...selectedAssets, ...materials.filter(m => !selectedAssets.some(s => s.id === m.id))]}
          onClose={() => setSelectedDetailAsset(null)}
          onUpdate={(updatedAsset) => {
            if (updatedAsset) {
              // 更新 materials 中的素材
              setMaterials((prev) =>
                prev.map((a) => (a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a))
              );
              // 更新 selectedAssets 中的素材
              setSelectedAssets((prev) =>
                prev.map((a) => (a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a))
              );
            }
            // 同时刷新项目数据确保同步
            loadProject();
          }}
        />
        
        {/* 任务详情抽屉 */}
        <Sheet open={!!selectedTaskDetail} onOpenChange={() => setSelectedTaskDetail(null)}>
          <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <span>任务详情</span>
                <span className="text-sm font-normal text-muted-foreground font-mono">{selectedTaskDetail?.id.slice(0, 20)}...</span>
              </SheetTitle>
            </SheetHeader>
            
            {selectedTaskDetail && (
              <div className="mt-6 space-y-6">
                {/* 状态信息 */}
                <div className="flex items-center gap-4">
                  <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full",
                    selectedTaskDetail.status === "succeeded" ? "bg-green-100 text-green-700" :
                    selectedTaskDetail.status === "running" ? "bg-blue-100 text-blue-700" :
                    selectedTaskDetail.status === "failed" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-700"
                  )}>
                    {selectedTaskDetail.status === "succeeded" && <CheckCircle className="w-4 h-4" />}
                    {selectedTaskDetail.status === "running" && <Loader className="w-4 h-4 animate-spin" />}
                    {selectedTaskDetail.status === "failed" && <XCircle className="w-4 h-4" />}
                    {selectedTaskDetail.status === "pending" && <Clock className="w-4 h-4" />}
                    {selectedTaskDetail.status === "queued" && <Clock className="w-4 h-4" />}
                    <span className="text-sm font-medium">
                      {selectedTaskDetail.status === "succeeded" ? "已完成" :
                       selectedTaskDetail.status === "running" ? "生成中" :
                       selectedTaskDetail.status === "failed" ? "失败" : "排队中"}
                    </span>
                  </div>
                </div>
                
                {/* 视频预览 */}
                {selectedTaskDetail.result?.video_url && (
                  <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                    <video
                      src={selectedTaskDetail.result.video_url}
                      controls
                      className="w-full h-full object-contain"
                    />
                  </div>
                )}
                
                {/* Token 消耗 */}
                {selectedTaskDetail.completion_tokens && (
                  <div className="flex items-center gap-4 p-3 bg-yellow-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-5 h-5 text-yellow-600" />
                      <span className="text-sm font-medium">Token 消耗</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Coins className="w-4 h-4 text-yellow-500" />
                      <span className="text-yellow-700 font-medium">
                        {selectedTaskDetail.completion_tokens.toLocaleString()}
                      </span>
                      <span className="text-yellow-600">tokens</span>
                    </div>
                  </div>
                )}
                
                {/* 时间信息 */}
                <div className="space-y-3">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    时间信息
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">提交时间</div>
                      <div className="text-sm">
                        {new Date(selectedTaskDetail.created_at).toLocaleString("zh-CN")}
                      </div>
                    </div>
                    {selectedTaskDetail.completed_at && (
                      <div className="bg-muted rounded-lg p-3">
                        <div className="text-xs text-muted-foreground mb-1">完成时间</div>
                        <div className="text-sm">
                          {new Date(selectedTaskDetail.completed_at).toLocaleString("zh-CN")}
                        </div>
                      </div>
                    )}
                    {(selectedTaskDetail.queue_duration || selectedTaskDetail.generation_duration) && (
                      <>
                        {selectedTaskDetail.queue_duration && (
                          <div className="bg-muted rounded-lg p-3">
                            <div className="text-xs text-muted-foreground mb-1">排队耗时</div>
                            <div className="text-sm">{formatSeconds(selectedTaskDetail.queue_duration)}</div>
                          </div>
                        )}
                        {selectedTaskDetail.generation_duration && (
                          <div className="bg-muted rounded-lg p-3">
                            <div className="text-xs text-muted-foreground mb-1">生成耗时</div>
                            <div className="text-sm">{formatSeconds(selectedTaskDetail.generation_duration)}</div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
                
                {/* 提示词信息 */}
                {selectedTaskDetail.prompt_boxes && selectedTaskDetail.prompt_boxes.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      提示词
                    </h3>
                    <div className="bg-muted rounded-lg p-3 space-y-2">
                      {selectedTaskDetail.prompt_boxes.filter(box => box.is_activated).map((box, idx) => (
                        <p key={box.id} className="text-sm whitespace-pre-wrap">{box.content}</p>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* 错误信息 */}
                {selectedTaskDetail.status === "failed" && selectedTaskDetail.error_message && (
                  <div className="space-y-2">
                    <h3 className="text-sm font-medium flex items-center gap-2 text-red-600">
                      <AlertCircle className="w-4 h-4" />
                      错误信息
                    </h3>
                    <div className="bg-red-50 rounded-lg p-3">
                      <p className="text-sm text-red-700 whitespace-pre-wrap">{selectedTaskDetail.error_message}</p>
                    </div>
                  </div>
                )}
                
                {/* 操作按钮 */}
                <div className="flex gap-2 pt-4 border-t">
                  {selectedTaskDetail.result?.video_url && (
                    <Button
                      variant="outline"
                      className="flex-1 gap-2"
                      onClick={() => {
                        const a = document.createElement("a");
                        a.href = selectedTaskDetail.result!.video_url!;
                        a.download = `video-${selectedTaskDetail.id}.mp4`;
                        a.click();
                      }}
                    >
                      <Download className="w-4 h-4" />
                      下载视频
                    </Button>
                  )}
                </div>
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </ProjectDetailContext.Provider>
  );
}
