"use client";

import { useEffect, useState, createContext, useContext, ReactNode, use, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Video, FolderOpen, ListTodo, Settings, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose, X, Scissors, Image, Music, Film, Sun, Moon, Eye, Download, Camera, XCircle, Clock, Loader, CheckCircle, Sparkles, Coins, AlertCircle, RotateCcw, Upload } from "lucide-react";
import { getProject, Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Asset, getAssets } from "@/lib/assets";
import { Task, getTasks, TaskStatus, deleteTask } from "@/lib/tasks";
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
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";

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
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  const handleClick = (e: React.MouseEvent) => {
    // 如果是拖拽操作，不触发点击
    if (isDragging.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (onClick && (asset.type === "image" || asset.type === "keyframe")) {
      onClick(asset);
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    isDragging.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartPos.current) {
      const dx = Math.abs(e.clientX - dragStartPos.current.x);
      const dy = Math.abs(e.clientY - dragStartPos.current.y);
      // 如果移动超过 5px，认为是拖拽操作
      if (dx > 5 || dy > 5) {
        isDragging.current = true;
      }
    }
  };

  const handleMouseUp = () => {
    // 延迟重置状态，确保 click 事件能正确判断
    setTimeout(() => {
      isDragging.current = false;
      dragStartPos.current = null;
    }, 50);
  };

  const handleDragStart = (e: React.DragEvent) => {
    // 标记为拖拽状态
    isDragging.current = true;
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
    // 如果是拖拽操作，不触发点击
    if (isDragging.current) return;
    e.preventDefault();
    e.stopPropagation();
    if (onClick && (asset.type === "image" || asset.type === "keyframe")) {
      onClick(asset);
    }
  };

  return (
    <div
      draggable
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
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
            "w-full flex items-center justify-center bg-muted",
            size === "small" ? "aspect-square" : "aspect-video"
          )}>
            {asset.thumbnail_url ? (
              <img
                src={asset.thumbnail_url}
                alt={asset.name}
                className="max-w-full max-h-full object-contain"
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
  const [uploading, setUploading] = useState(false);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  // 统一的回滚处理函数（用于需要跳转的场景，如左侧任务管理页面）
  const handleRollback = (task: Task) => {
    const taskData = {
      id: task.id,
      prompt_boxes: task.prompt_boxes,
      selected_assets: task.selected_assets,
      params: task.params,
    };
    console.log("执行回滚，保存数据:", taskData);
    sessionStorage.setItem("rollbackTask", JSON.stringify(taskData));
    router.push(`/projects/${resolvedParams.id}`);
  };

  // 右侧侧边栏回滚 - 直接在当前页面恢复数据，不跳转
  const handleRollbackInline = (task: Task) => {
    console.log("执行页面内回滚:", task);

    // 恢复提示词
    if (task.prompt_boxes && task.prompt_boxes.length > 0) {
      // 需要通过某种方式通知 page.tsx 恢复数据
      // 使用 sessionStorage 传递数据，page.tsx 会自动检测并恢复
      const taskData = {
        id: task.id,
        prompt_boxes: task.prompt_boxes,
        selected_assets: task.selected_assets,
        params: task.params,
      };
      sessionStorage.setItem("rollbackTask", JSON.stringify(taskData));
      // 触发页面重新检测回滚数据
      window.location.reload();
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

  // 上传图片素材
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of files) {
        // 验证文件类型
        const isImage = file.type.startsWith("image/");
        if (!isImage) {
          toast.error(`${file.name} 格式不支持`);
          continue;
        }

        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", resolvedParams.id);
        formData.append("type", "image");
        formData.append("asset_category", "image");

        const response = await fetch("/api/assets/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("上传失败");
        }

        const result = await response.json();

        // 检查返回的 id 是否有效
        if (!result.id) {
          throw new Error("素材记录创建失败");
        }

        // 创建素材记录
        const newAsset: Asset = {
          id: result.id,
          project_id: resolvedParams.id,
          name: file.name,
          type: "image",
          asset_category: "image",
          url: result.url,
          thumbnail_url: result.thumbnailUrl || result.url,
          size: file.size,
          created_at: new Date().toISOString(),
        };

        setMaterials((prev) => [newAsset, ...prev]);
      }

      toast.success("上传成功");
    } catch (error) {
      console.error("上传失败:", error);
      toast.error("上传失败");
    } finally {
      setUploading(false);
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
              {mounted && (theme === "dark" ? <Sun className="w-5 h-5 flex-shrink-0" /> : <Moon className="w-5 h-5 flex-shrink-0" />)}
              <span className={cn(collapsed && "hidden")}>{mounted && (theme === "dark" ? "浅色" : "深色")}</span>
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
            
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4">
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
                  {/* 上传按钮 */}
                  <div className="mb-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={(e) => handleUpload(e.target.files)}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full gap-1"
                      disabled={uploading}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploading ? "上传中..." : "上传图片"}</span>
                    </Button>
                  </div>
                  {filtered.image.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {filtered.image.map((asset) => (
                          <div key={asset.id} className="relative">
                            <DraggableAsset
                              asset={asset}
                              size="small"
                              onClick={setSelectedDetailAsset}
                            />
                            <p className="text-xs text-center mt-1 truncate max-w-24" title={asset.display_name || asset.name}>
                              {asset.display_name || asset.name}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {filtered.keyframe.length > 0 && (
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {filtered.keyframe.map((asset) => (
                          <div key={asset.id} className="relative">
                            <DraggableAsset
                              asset={asset}
                              size="small"
                              onClick={setSelectedDetailAsset}
                            />
                            <p className="text-xs text-center mt-1 truncate max-w-24" title={asset.display_name || asset.name}>
                              {asset.display_name || asset.name}
                            </p>
                          </div>
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
                        <div key={task.id} className="bg-muted rounded-lg p-2">
                          {/* 顶部：ID + 状态 */}
                          <div className="flex items-center justify-between mb-1.5">
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
                          
                          {/* 视频/状态区域 */}
                          {task.status === "succeeded" && task.result?.video_url ? (
                            <div className="mb-1.5">
                              <video
                                ref={(el) => {
                                  if (el) videoRefs.current.set(task.id, el);
                                }}
                                src={task.result.video_url}
                                controls
                                className="w-full aspect-video bg-black rounded"
                                preload="metadata"
                              />
                            </div>
                          ) : task.status === "running" ? (
                            <div className="h-20 bg-muted-foreground/10 rounded flex items-center justify-center mb-1.5">
                              <Loader className="w-6 h-6 animate-spin text-blue-500" />
                            </div>
                          ) : task.status === "failed" ? (
                            <div className="h-20 bg-muted-foreground/10 rounded flex items-center justify-center mb-1.5">
                              <XCircle className="w-6 h-6 text-red-500" />
                            </div>
                          ) : (
                            <div className="h-20 bg-muted-foreground/10 rounded flex items-center justify-center mb-1.5">
                              <Clock className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* Token */}
                          {task.completion_tokens && (
                            <div className="text-xs text-yellow-600 mb-1.5">
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
                                if (!task.result || !task.result.video_url) return;
                                
                                toast.promise(
                                  async () => {
                                    const response = await fetch("/api/assets/extract-frame", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({
                                        video_url: task.result!.video_url,
                                        project_id: resolvedParams.id,
                                        task_id: task.id,
                                      }),
                                    });
                                    
                                    if (!response.ok) {
                                      const error = await response.json();
                                      throw new Error(error.error || "抽帧失败");
                                    }
                                    
                                    return response.json();
                                  },
                                  {
                                    loading: "正在抽帧...",
                                    success: (data) => {
                                      loadMaterials?.();
                                      return `已保存为关键帧`;
                                    },
                                    error: (err) => err.message || "抽帧失败",
                                  }
                                );
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
                            {task.status === "succeeded" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 gap-0.5 text-xs h-6 px-1 text-orange-500"
                                onClick={() => handleRollbackInline(task)}
                              >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>回滚</span>
                              </Button>
                            )}
                          </div>
                          
                          {/* 生成进度条 */}
                          {task.status === "running" && (
                            <div className="h-1 bg-muted-foreground/20 mt-1.5 rounded-full overflow-hidden">
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
        <TaskDetailSheet
          task={selectedTaskDetail}
          assets={materials}
          projectId={resolvedParams.id}
          onClose={() => setSelectedTaskDetail(null)}
          onRollback={(task) => {
            // 右侧侧边栏：直接在当前页面恢复数据
            handleRollbackInline(task);
            setSelectedTaskDetail(null);
          }}
          onDelete={(taskId) => {
            deleteTask(taskId).then(() => {
              setTasks(prev => prev.filter(t => t.id !== taskId));
              toast.success("删除成功");
            }).catch(() => {
              toast.error("删除失败");
            });
          }}
          onAssetCreated={loadMaterials}
        />
      </div>
    </ProjectDetailContext.Provider>
  );
}
