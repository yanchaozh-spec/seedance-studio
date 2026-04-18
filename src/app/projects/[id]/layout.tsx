"use client";

import { useEffect, useState, createContext, useContext, ReactNode, use, useRef, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Video, FolderOpen, ListTodo, Settings, ChevronLeft, ChevronRight, PanelRightOpen, PanelRightClose, X, Scissors, Image, Music, Sun, Moon, Eye, Download, Camera, XCircle, Clock, Loader, CheckCircle, Check, Sparkles, Coins, AlertCircle, RotateCcw, Upload } from "lucide-react";
import { getProject, Project } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Asset, getAssets, deleteAsset, reorderAssets } from "@/lib/assets";
import { onAssetsChanged, emitAssetsChanged } from "@/lib/events";
import { uploadFile } from "@/lib/upload";
import { Task, getTasks, TaskStatus, deleteTask, getVideoUrl } from "@/lib/tasks";
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
import { VideoPlayer } from "@/components/ui/video-player";

// dnd-kit 拖拽排序
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

interface ProjectDetailContextType {
  project: Project | null;
  loading: boolean;
  selectedAssets: SelectedAsset[];
  setSelectedAssets: React.Dispatch<React.SetStateAction<SelectedAsset[]>>;
  materials: Asset[];
  setMaterials: React.Dispatch<React.SetStateAction<Asset[]>>;
  refreshMaterials: () => Promise<void>;
  addAssetToPool: (asset: Asset) => void;
  removeAssetFromPool: (assetId: string) => void;
  clearPool: () => void;
  toggleAssetActivation: (assetId: string) => void;
  refreshTasks: () => void;
}

const ProjectDetailContext = createContext<ProjectDetailContextType>({
  project: null,
  loading: true,
  selectedAssets: [],
  setSelectedAssets: () => {},
  materials: [],
  setMaterials: () => {},
  refreshMaterials: async () => {},
  addAssetToPool: () => {},
  removeAssetFromPool: () => {},
  clearPool: () => {},
  toggleAssetActivation: () => {},
  refreshTasks: () => {},
});

export const useProjectDetail = () => useContext(ProjectDetailContext);

interface DraggableAssetProps {
  asset: Asset;
  showRemove?: boolean;
  onRemove?: (assetId: string) => void;
  onClick?: (asset: Asset) => void;
  size?: "small" | "large";
  showLabel?: boolean;
  isActivated?: boolean;
  onToggleActivation?: () => void;
}

export function DraggableAsset({ 
  asset, 
  showRemove, 
  onRemove, 
  onClick, 
  size = "small", 
  showLabel = false,
  isActivated,
  onToggleActivation,
}: DraggableAssetProps) {
  const setDragging = useDragStore((state) => state.setDragging);
  const imageRef = useRef<HTMLImageElement>(null);
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

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
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
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
      // 检查图片是否已加载且状态正常
      const img = imageRef.current;
      if (img.complete && img.naturalWidth > 0) {
        // 创建临时 canvas 来绘制缩略图
        const canvas = document.createElement("canvas");
        canvas.width = 80;
        canvas.height = 80;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // 绘制背景
          ctx.fillStyle = "#1f2937";
          ctx.fillRect(0, 0, 80, 80);
          // 绘制图片
          ctx.drawImage(img, 0, 0, 80, 80);
          canvas.toBlob((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              const dragImg = document.createElement("img");
              dragImg.onload = () => {
                e.dataTransfer.setDragImage(dragImg, 40, 40);
                URL.revokeObjectURL(url);
              };
              dragImg.src = url;
            }
          });
        }
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
        size === "small" ? "w-20" : "w-full"
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
            {/* 关键帧标识 */}
            {asset.asset_category === "keyframe" && (
              <div className={cn(
                "absolute top-1 left-1 bg-primary text-primary-foreground rounded flex items-center gap-0.5 z-10",
                size === "small" ? "text-[8px] px-1 py-0.5" : "text-[10px] px-1.5 py-0.5"
              )}>
                <Scissors className={size === "small" ? "w-2.5 h-2.5" : "w-3 h-3"} />
                <span>关键帧</span>
              </div>
            )}
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
          {/* 底部信息 */}
          {(showLabel || isActivated !== undefined || asset.asset_category !== "keyframe") && (
            <div className={cn("space-y-1", size === "small" ? "p-1" : "p-2")}>
              {/* 名称显示 */}
              {showLabel && (
                <p 
                  className={cn(
                    "text-muted-foreground text-center truncate",
                    size === "small" ? "text-[10px] px-0.5" : "text-xs"
                  )}
                  title={asset.display_name || asset.name}
                >
                  {asset.display_name || asset.name}
                </p>
              )}
              {/* 关键帧描述 - 仅关键帧显示，与美术资产的音频行高度对齐 */}
              {asset.asset_category === "keyframe" && (
                <p
                  className={cn(
                    "text-muted-foreground/70 text-center truncate",
                    size === "small" ? "text-[9px] px-0.5" : "text-[11px]"
                  )}
                  title={asset.keyframe_description || ""}
                >
                  {asset.keyframe_description || "-"}
                </p>
              )}
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
              {/* 激活按钮 */}
              {isActivated !== undefined && onToggleActivation && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleActivation();
                  }}
                  className={cn(
                    "w-full flex items-center justify-center gap-1 rounded text-xs cursor-pointer transition-all",
                    isActivated 
                      ? "bg-primary text-primary-foreground" 
                      : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30",
                    size === "small" ? "py-0.5 px-1 text-[10px]" : "py-1"
                  )}
                >
                  <span>{isActivated ? "激活" : "激活"}</span>
                  {isActivated && <Check className={size === "small" ? "w-2 h-2" : "w-3 h-3"} />}
                </button>
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

// 可排序的素材项（用于右侧侧边栏素材库）
function SortableMaterialItem({
  asset,
  isInPool,
  onClick,
  onRemove,
}: {
  asset: Asset;
  isInPool: boolean;
  onClick: (asset: Asset) => void;
  onRemove: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: asset.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="relative group">
      {/* 拖拽手柄 */}
      <div className="absolute top-0.5 left-0.5 z-20">
        <div
          {...attributes}
          {...listeners}
          className="p-0.5 rounded bg-background/80 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>
      {isInPool && (
        <div className="absolute top-0 right-0 z-10 bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
          <CheckCircle className="w-2.5 h-2.5" />
        </div>
      )}
      <DraggableAsset
        asset={asset}
        size="small"
        showLabel
        onClick={onClick}
        showRemove
        onRemove={onRemove}
      />
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
    // 更新请求标识
    projectIdRef.current = resolvedParams.id;
    loadProject(resolvedParams.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedParams.id]);

  // 监听素材变更事件（从其他页面（如素材库）上传后触发刷新）
  useEffect(() => {
    const unsubscribe = onAssetsChanged((event) => {
      if (event.projectId === resolvedParams.id) {
        loadMaterials();
      }
    });
    return unsubscribe;
  }, [resolvedParams.id]);

  // 任务轮询：持续获取任务列表（检测新任务）和更新运行中任务状态
  useEffect(() => {
    // 轮询函数
    const pollTasks = async () => {
      try {
        // 获取最新任务列表
        const data = await getTasks(resolvedParams.id);
        
        // 检查是否有新任务或任务状态变化
        setTasks((prevTasks) => {
          // 如果任务数量变化或有任务状态变化，更新列表
          if (prevTasks.length !== data.length) {
            return data;
          }
          // 检查每个任务的状态是否有变化
          const hasStatusChange = data.some((newTask) => {
            const prevTask = prevTasks.find((t) => t.id === newTask.id);
            return prevTask && prevTask.status !== newTask.status;
          });
          if (hasStatusChange) {
            return data;
          }
          return prevTasks;
        });

        // 轮询运行中任务的状态
        const runningTasks = data.filter((t) => t.status === "pending" || t.status === "queued" || t.status === "running");
        for (const task of runningTasks) {
          try {
            const apiKey = useSettingsStore.getState().arkApiKey;
            const headers: Record<string, string> = {};
            if (apiKey) {
              headers["x-ark-api-key"] = apiKey;
            }
            
            // 传递 TOS 配置到后端（用于视频上传）
            const tosEnabled = useSettingsStore.getState().tosEnabled;
            const tosSettings = useSettingsStore.getState().tosSettings;
            if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey) {
              headers["x-tos-config"] = Buffer.from(JSON.stringify(tosSettings)).toString("base64");
            }
            
            const response = await fetch(`/api/tasks/${task.id}/poll`, { headers });
            if (response.ok) {
              const updatedTask = await response.json();
              // 如果状态有变化，更新任务列表
              if (updatedTask.status !== task.status) {
                setTasks((prev) =>
                  prev.map((t) => (t.id === task.id ? { ...t, ...updatedTask } : t))
                );
              }
            }
          } catch (error) {
            console.error(`轮询任务 ${task.id} 状态失败:`, error);
          }
        }
      } catch (error) {
        console.error("轮询任务列表失败:", error);
      }
    };

    // 首次加载
    pollTasks();
    
    // 每 3 秒轮询一次
    const interval = setInterval(pollTasks, 3000);
    
    return () => clearInterval(interval);
  }, [resolvedParams.id]);

  // 组件卸载时清理 videoRefs，防止内存泄漏
  useEffect(() => {
    return () => {
      // 先暂停所有视频，彻底释放资源
      videoRefs.current.forEach((video) => {
        if (video) {
          try {
            video.pause();
            video.removeAttribute("src");
            video.load();
          } catch (e) {
            console.warn("清理视频资源失败:", e);
          }
        }
      });
      videoRefs.current.clear();
    };
  }, []);

  // 使用请求标识防止竞态条件
  const projectIdRef = useRef<string>("");

  const loadProject = async (currentProjectId: string) => {
    // 请求标识校验：忽略过期请求的响应
    const requestId = currentProjectId;
    
    try {
      setLoading(true);
      const data = await getProject(currentProjectId);
      
      // 检查是否是最新的请求
      if (projectIdRef.current !== requestId) {
        console.log("忽略过期请求:", requestId, "最新:", projectIdRef.current);
        return;
      }
      
      setProject(data);
      const assets = await getAssets(currentProjectId);
      
      // 再次检查是否是最新的请求
      if (projectIdRef.current !== requestId) {
        console.log("忽略过期请求(assets):", requestId, "最新:", projectIdRef.current);
        return;
      }
      
      setMaterials(assets);
    } catch (error) {
      // 只在组件仍挂载且请求未过期时处理错误
      if (projectIdRef.current === requestId) {
        console.error("加载项目失败:", error);
        router.push("/projects");
      }
    } finally {
      // 只在组件仍挂载且请求未过期时更新状态
      if (projectIdRef.current === requestId) {
        setLoading(false);
      }
    }
  };

  // 统一的回滚处理函数（用于需要跳转的场景，如左侧任务管理页面）
  const handleRollback = (task: Task) => {
    // 使用 history.state 替代 sessionStorage，避免同步阻塞
    if (task.prompt_boxes && task.prompt_boxes.length > 0) {
      const taskData = {
        id: task.id,
        prompt_boxes: task.prompt_boxes,
        selected_assets: task.selected_assets,
        params: task.params,
      };
      // 使用 history.state 传递数据，避免 JSON.stringify 阻塞
      window.history.pushState(taskData, "", window.location.href);
      router.push(`/projects/${resolvedParams.id}`);
    }
  };

  // 右侧侧边栏回滚 - 使用 window.location.href 刷新当前页面，比 window.location.reload() 更快
  const handleRollbackInline = (task: Task) => {
    // 恢复提示词
    if (task.prompt_boxes && task.prompt_boxes.length > 0) {
      const taskData = {
        id: task.id,
        prompt_boxes: task.prompt_boxes,
        selected_assets: task.selected_assets,
        params: task.params,
      };
      // 使用 sessionStorage 传递回滚数据
      sessionStorage.setItem("rollbackTask", JSON.stringify(taskData));
      // 关闭任务详情抽屉
      setSelectedTaskDetail(null);
      // 刷新当前页面，比 window.location.reload() 更快
      window.location.href = window.location.href;
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

  // 加载素材列表（带竞态保护）
  const loadMaterials = useCallback(async () => {
    const requestId = resolvedParams.id;
    try {
      const assets = await getAssets(resolvedParams.id);
      // 检查是否是最新的请求，防止 projectId 切换后旧请求覆盖数据
      if (projectIdRef.current !== requestId) {
        console.log("忽略过期素材加载请求:", requestId, "最新:", projectIdRef.current);
        return;
      }
      setMaterials(assets);
    } catch (error) {
      if (projectIdRef.current === requestId) {
        console.error("加载素材失败:", error);
      }
    }
  }, [resolvedParams.id]);

  // 上传图片素材
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      let uploadCount = 0;
      
      for (const file of files) {
        // 验证文件类型
        const isImage = file.type.startsWith("image/");
        if (!isImage) {
          toast.error(`${file.name} 格式不支持`);
          continue;
        }

        try {
          // 使用 uploadFile 函数，它会自动处理 TOS 配置
          await uploadFile(file, {
            projectId: resolvedParams.id,
            type: "image",
          });
          uploadCount++;
        } catch (uploadError) {
          console.error("上传失败:", uploadError);
          // 提取错误信息
          const message = uploadError instanceof Error ? uploadError.message : "上传失败";
          toast.error(`${file.name}: ${message}`);
        }
      }
      
      if (uploadCount > 0) {
        toast.success(`成功上传 ${uploadCount} 个素材`);
        // 刷新素材列表
        loadMaterials();
        emitAssetsChanged(resolvedParams.id, 'upload');
      }
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

  // 删除素材（从数据库中彻底删除）
  const handleDeleteMaterial = async (assetId: string) => {
    try {
      await deleteAsset(assetId);
      // 从素材库中移除
      setMaterials((prev) => prev.filter((a) => a.id !== assetId));
      // 从已选中素材池中移除
      setSelectedAssets((prev) => prev.filter((a) => a.id !== assetId));
      toast.success("素材已删除");
      // 通知其他组件素材已删除
      emitAssetsChanged(resolvedParams.id, 'delete');
    } catch (error) {
      console.error("删除素材失败:", error);
      toast.error("删除失败");
    }
  };

  // 素材库拖拽排序传感器
  const materialSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 素材库拖拽排序处理
  const handleMaterialDragEnd = useCallback(
    (event: DragEndEvent, assetList: Asset[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = assetList.findIndex((a) => a.id === active.id);
      const newIndex = assetList.findIndex((a) => a.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // 乐观更新：立即调整本地顺序
      const reordered = [...assetList];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      // 更新 materials：保持其他素材不变，替换当前分组的排序
      const movedIds = new Set(assetList.map((a) => a.id));
      const otherAssets = materials.filter((m) => !movedIds.has(m.id));
      setMaterials([...otherAssets, ...reordered]);

      // 持久化排序到后端（只保存当前分组的排序）
      const items = reordered.map((a, i) => ({ id: a.id, sort_order: i }));
      reorderAssets(items).then(() => {
        emitAssetsChanged(resolvedParams.id, 'reorder');
      }).catch((err) => {
        console.error("保存排序失败:", err);
        toast.error("排序保存失败");
      });
    },
    [materials]
  );

  const navItems = [
    { href: `/projects/${resolvedParams.id}`, icon: Video, label: "视频生成", exact: true },
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
        refreshMaterials: loadMaterials,
        addAssetToPool,
        removeAssetFromPool,
        clearPool,
        toggleAssetActivation,
        refreshTasks: loadTasks,
      }}
    >
      <div className="flex h-screen bg-background" suppressHydrationWarning>
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
          <aside className="w-72 border-l bg-card flex flex-col shrink-0 max-h-screen">
            {/* 标签页切换 */}
            <div className="p-2 border-b shrink-0">
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
            
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 space-y-2">
              {/* 素材库内容 */}
              {activeTab === "materials" && (
                <>
                  <Tabs value={materialFilter} onValueChange={(v) => setMaterialFilter(v as typeof materialFilter)} className="mb-2" suppressHydrationWarning>
                    <TabsList className="w-full h-7" suppressHydrationWarning>
                      <TabsTrigger value="all" className="flex-1 text-xs" suppressHydrationWarning>全部</TabsTrigger>
                      <TabsTrigger value="keyframe" className="flex-1 text-xs" suppressHydrationWarning>关键帧</TabsTrigger>
                      <TabsTrigger value="image" className="flex-1 text-xs" suppressHydrationWarning>美术</TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {/* 上传按钮 */}
                  <div className="mb-2">
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
                    <DndContext
                      sensors={materialSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => handleMaterialDragEnd(event, filtered.image)}
                    >
                      <SortableContext items={filtered.image.map((a) => a.id)} strategy={rectSortingStrategy}>
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {filtered.image.map((asset) => (
                            <SortableMaterialItem
                              key={asset.id}
                              asset={asset}
                              isInPool={selectedAssets.some((s) => s.id === asset.id)}
                              onClick={setSelectedDetailAsset}
                              onRemove={handleDeleteMaterial}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}

                  {filtered.keyframe.length > 0 && (
                    <DndContext
                      sensors={materialSensors}
                      collisionDetection={closestCenter}
                      onDragEnd={(event) => handleMaterialDragEnd(event, filtered.keyframe)}
                    >
                      <SortableContext items={filtered.keyframe.map((a) => a.id)} strategy={rectSortingStrategy}>
                        <div className="flex flex-wrap gap-1.5 mb-4">
                          {filtered.keyframe.map((asset) => (
                            <SortableMaterialItem
                              key={asset.id}
                              asset={asset}
                              isInPool={selectedAssets.some((s) => s.id === asset.id)}
                              onClick={setSelectedDetailAsset}
                              onRemove={handleDeleteMaterial}
                            />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}


                  {(filtered.image.length + filtered.keyframe.length) === 0 && (
                    <div className="text-center py-6 text-muted-foreground text-xs">
                      <FolderOpen className="w-8 h-8 mx-auto mb-2" />
                      <p>暂无素材</p>
                      <p className="text-[10px]">请先上传素材</p>
                    </div>
                  )}
                </>
              )}

              {/* 任务管理内容 */}
              {activeTab === "tasks" && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mb-2 text-xs h-7"
                    onClick={() => router.push(`/projects/${resolvedParams.id}/tasks`)}
                  >
                    完整任务管理
                  </Button>
                  {loadingTasks ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin w-4 h-4 border-2 border-primary border-t-transparent rounded-full" />
                    </div>
                  ) : tasks.length === 0 ? (
                    <div className="text-center py-4 text-muted-foreground text-xs">
                      <Video className="w-6 h-6 mx-auto mb-1" />
                      <p>暂无任务</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tasks.slice(0, 10).map((task) => (
                        <div key={task.id} className="bg-muted rounded-md p-2 space-y-1.5">
                          {/* 顶部：ID + 状态 */}
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-muted-foreground font-mono truncate">
                              {task.id.slice(0, 8)}...
                            </span>
                            <span className={cn("text-[10px] font-medium flex-shrink-0 ml-1", 
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
                          {task.status === "succeeded" && getVideoUrl(task) ? (
                            <VideoPlayer
                              ref={(el) => {
                                if (el) videoRefs.current.set(task.id, el);
                              }}
                              src={getVideoUrl(task) || ""}
                            />
                          ) : task.status === "running" ? (
                            <div className="h-10 bg-muted-foreground/10 rounded flex items-center justify-center">
                              <Loader className="w-4 h-4 animate-spin text-blue-500" />
                            </div>
                          ) : task.status === "failed" ? (
                            <div className="h-10 bg-muted-foreground/10 rounded flex items-center justify-center">
                              <XCircle className="w-4 h-4 text-red-500" />
                            </div>
                          ) : (
                            <div className="h-10 bg-muted-foreground/10 rounded flex items-center justify-center">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          
                          {/* Token */}
                          {task.completion_tokens && (
                            <div className="text-[10px] text-yellow-600 truncate">
                              {task.completion_tokens.toLocaleString()} tokens
                            </div>
                          )}
                          
                          {/* 操作按钮 */}
                          <div className="grid grid-cols-4 gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[10px] h-6 px-0.5"
                              onClick={() => setSelectedTaskDetail(task)}
                            >
                              详情
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[10px] h-6 px-0.5"
                              onClick={() => {
                                if (!task.result || !task.result.video_url) return;
                                
                                // 获取当前播放时间
                                const videoEl = videoRefs.current.get(task.id);
                                const currentTime = videoEl?.currentTime ?? 0;
                                
                                toast.promise(
                                  async () => {
                                    // 获取 TOS 配置
                                    const { tosEnabled, tosSettings } = useSettingsStore.getState();
                                    const requestBody: Record<string, unknown> = {
                                      video_url: task.result!.video_url,
                                      project_id: resolvedParams.id,
                                      task_id: task.id,
                                      timestamp: currentTime,
                                    };
                                    if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey) {
                                      requestBody.tos_config = tosSettings;
                                    }
                                    
                                    const response = await fetch("/api/assets/extract-frame", {
                                      method: "POST",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify(requestBody),
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
                              抽帧
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-[10px] h-6 px-0.5"
                              onClick={() => {
                                const a = document.createElement("a");
                                a.href = getVideoUrl(task) || "";
                                a.download = `video-${task.id}.mp4`;
                                a.click();
                              }}
                            >
                              下载
                            </Button>
                            {task.status === "succeeded" && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-[10px] h-6 px-0.5 text-orange-500"
                                onClick={() => handleRollbackInline(task)}
                              >
                                回滚
                              </Button>
                            )}
                          </div>
                          
                          {/* 生成进度条 */}
                          {task.status === "running" && (
                            <div className="h-1 bg-muted-foreground/20 rounded-full overflow-hidden">
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
              // 更新当前选中的素材（用于详情对话框）
              setSelectedDetailAsset(updatedAsset);
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
            loadProject(resolvedParams.id);
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
