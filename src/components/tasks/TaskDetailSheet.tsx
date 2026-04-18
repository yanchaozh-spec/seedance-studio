"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  RotateCcw,
  Download,
  Trash2,
  Camera,
  Image as ImageIcon,
  Music,
  Film,
  Clock,
  Play,
  CheckCircle,
  Loader2,
  Sparkles,
  Coins,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { Task, TaskStatus, deleteTask, getVideoUrl } from "@/lib/tasks";
import { Asset, submitFrameFromCanvas } from "@/lib/assets";
import { useSettingsStore } from "@/lib/settings";
import { formatDistanceToNow, formatDuration } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VideoPlayer } from "@/components/ui/video-player";

const statusConfig: Record<TaskStatus, { icon: React.ElementType; label: string; color: string }> = {
  pending: { icon: Clock, label: "等待中", color: "text-gray-500" },
  queued: { icon: Loader2, label: "排队中", color: "text-yellow-500" },
  running: { icon: Loader2, label: "生成中", color: "text-blue-500" },
  succeeded: { icon: CheckCircle, label: "已完成", color: "text-green-500" },
  failed: { icon: XCircle, label: "失败", color: "text-red-500" },
};

// 格式化时长
function formatSeconds(seconds: number | null | undefined): string {
  if (!seconds && seconds !== 0) return "-";
  if (seconds < 60) return `${seconds}秒`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}分${remainingSeconds}秒` : `${minutes}分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}小时${remainingMinutes}分`;
}

interface TaskDetailSheetProps {
  task: Task | null;
  assets: Asset[];
  projectId: string;
  onClose: () => void;
  onRollback?: (task: Task) => void;
  onDelete?: (taskId: string, taskIdExternal?: string) => void;
  onAssetCreated?: () => void;
}

export function TaskDetailSheet({
  task,
  assets,
  projectId,
  onClose,
  onRollback,
  onDelete,
  onAssetCreated,
}: TaskDetailSheetProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [extracting, setExtracting] = useState(false);

  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  if (!task) return null;

  const selectedAssetObjects = task.selected_assets
    .map((id) => assets.find((a) => a.id === id))
    .filter(Boolean) as Asset[];

  const handleDownload = async () => {
    if (!getVideoUrl(task)) return;

    try {
      const response = await fetch(getVideoUrl(task) || "");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `video-${task.id}.mp4`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("下载成功");
    } catch (error) {
      toast.error("下载失败");
    }
  };

  const handleRollbackAction = () => {
    // 直接调用 onRollback 回调，由父组件统一处理
    if (onRollback) {
      onRollback(task);
    } else {
      // 默认回滚逻辑：保存数据并跳转
      const taskData = {
        id: task.id,
        prompt_boxes: task.prompt_boxes,
        selected_assets: task.selected_assets,
        params: task.params,
      };
      sessionStorage.setItem("rollbackTask", JSON.stringify(taskData));
      router.push(`/projects/${projectId}`);
    }
    // 关闭抽屉
    onClose();
  };

  const handleDeleteAction = () => {
    if (onDelete) {
      onDelete(task.id, task.task_id_external);
    } else {
      deleteTask(task.id, task.task_id_external).then(() => {
        toast.success("删除成功");
      }).catch(() => {
        toast.error("删除失败");
      });
    }
    onClose();
  };

  // 抽帧保存为素材
  const handleExtractFrame = async (assetCategory: "keyframe" | "image" = "image") => {
    if (!videoRef.current || !task) return;

    const video = videoRef.current;

    // 确保视频已加载且有有效尺寸
    if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
      toast.error("视频尚未加载完成，请稍后再试");
      return;
    }

    setExtracting(true);

    try {
      // 创建 canvas 并绘制当前帧
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("无法创建 canvas 上下文");
      }

      // 暂停视频并绘制当前帧
      const currentTime = video.currentTime;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      // 提交到服务器
      try {
        await submitFrameFromCanvas(canvas, projectId, {
          taskId: task.id,
          timestamp: currentTime,
          assetCategory,
          name: `视频帧_${new Date().toLocaleTimeString().replace(/:/g, "-")}`,
        });

        toast.success("已保存到素材库");
        onAssetCreated?.();
      } catch {
        // Canvas 被污染，降级到 API 方式
        toast.loading("正在抽帧...", { id: "extract-frame" });
        
        // 获取 TOS 配置
        const { tosEnabled, tosSettings } = useSettingsStore.getState();
        console.log("[ExtractFrame] Frontend - tosEnabled:", tosEnabled, "tosSettings:", tosSettings);
        console.log("[ExtractFrame] Frontend - currentTime:", currentTime);
        
        // 构建请求体
        const requestBody: Record<string, unknown> = {
          video_url: task.result!.video_url,
          project_id: projectId,
          task_id: task.id,
          timestamp: currentTime,
        };
        
        // 如果 TOS 已配置，将配置添加到请求体
        if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey) {
          requestBody.tos_config = tosSettings;
          console.log("[ExtractFrame] Frontend - Added tos_config to request body");
        } else {
          console.log("[ExtractFrame] Frontend - TOS not enabled or config incomplete");
        }
        
        const response = await fetch("/api/assets/extract-frame", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
          const error = await response.json();
          toast.error(error.error || "抽帧失败", { id: "extract-frame" });
        } else {
          toast.success("已保存到素材库", { id: "extract-frame" });
          onAssetCreated?.();
        }
      }
    } catch (error) {
      console.error("抽帧失败:", error);
      toast.error(error instanceof Error ? error.message : "抽帧失败");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <Sheet open={!!task} onOpenChange={() => onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <span>任务详情</span>
            <span className="text-sm font-normal text-muted-foreground font-mono">{task.id.slice(0, 20)}...</span>
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* 状态信息 */}
          <div className="flex items-center gap-4">
            <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full",
              task.status === "succeeded" ? "bg-green-100 text-green-700" :
              task.status === "running" ? "bg-blue-100 text-blue-700" :
              task.status === "failed" ? "bg-red-100 text-red-700" :
              "bg-gray-100 text-gray-700"
            )}>
              {(() => {
                const Icon = statusConfig[task.status].icon;
                return task.status === "running" || task.status === "queued" ? (
                  <Icon className="w-4 h-4 animate-spin" />
                ) : (
                  <Icon className="w-4 h-4" />
                );
              })()}
              <span className="text-sm font-medium">
                {task.status === "succeeded" ? "已完成" :
                 task.status === "running" ? "生成中" :
                 task.status === "failed" ? "失败" : "排队中"}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: zhCN })}
            </span>
          </div>

          {/* Token 消耗信息 */}
          {task.completion_tokens && (
            <div className="flex items-center gap-4 p-3 bg-yellow-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium">Token 消耗</span>
              </div>
              <div className="flex items-center gap-2">
                <Coins className="w-4 h-4 text-yellow-500" />
                <span className="text-yellow-700 font-medium">
                  {task.completion_tokens.toLocaleString()}
                </span>
                <span className="text-yellow-600">tokens</span>
              </div>
            </div>
          )}

          {/* 耗时统计 */}
          {(task.queue_duration || task.generation_duration) && (
            <div className="grid grid-cols-3 gap-3">
              {task.queue_duration && (
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-yellow-600 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="text-xs">排队</span>
                  </div>
                  <p className="font-medium">{formatSeconds(task.queue_duration)}</p>
                </div>
              )}
              {task.generation_duration && (
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                    <Play className="w-4 h-4" />
                    <span className="text-xs">生成</span>
                  </div>
                  <p className="font-medium">{formatSeconds(task.generation_duration)}</p>
                </div>
              )}
              {(task.queue_duration || task.generation_duration) && (
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-green-600 mb-1">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-xs">总计</span>
                  </div>
                  <p className="font-medium">
                    {formatSeconds((task.queue_duration || 0) + (task.generation_duration || 0))}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 视频播放器 */}
          {task.status === "succeeded" && getVideoUrl(task) && (
            <div className="space-y-3">
              {/* 自适应视频播放器，9:16 竖屏不会被放大 */}
              <div className="bg-black rounded-lg overflow-hidden relative" style={{ height: "400px" }}>
                <VideoPlayer
                  ref={videoRef}
                  src={getVideoUrl(task)}
                  muted={muted}
                  className="absolute inset-0 w-full h-full object-contain"
                />
              </div>
              {/* 音量控制 */}
              <div className="flex items-center gap-3 px-2">
                <button
                  onClick={() => setMuted(!muted)}
                  className="p-1 hover:bg-accent rounded"
                >
                  {muted ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 010 14.14M15.54 8.46a5 5 0 010 7.07" />
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    handleVolumeChange(parseFloat(e.target.value));
                    if (parseFloat(e.target.value) > 0) setMuted(false);
                  }}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-8">
                  {Math.round((muted ? 0 : volume) * 100)}%
                </span>
              </div>
              {/* 抽帧功能 */}
              <div className="flex items-center gap-2 pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleExtractFrame("image")}
                  disabled={extracting}
                  className="flex-1"
                >
                  {extracting ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Camera className="w-4 h-4 mr-2" />
                  )}
                  保存当前帧
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={extracting}>
                      <ImageIcon className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleExtractFrame("image")}>
                      <ImageIcon className="w-4 h-4 mr-2" />
                      保存为美术资产
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleExtractFrame("keyframe")}>
                      <Film className="w-4 h-4 mr-2" />
                      保存为关键帧
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          )}

          {/* 失败原因 */}
          {task.status === "failed" && task.error_message && (
            <div className="bg-destructive/10 text-destructive rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">生成失败</p>
                <p className="text-sm mt-1">{task.error_message}</p>
              </div>
            </div>
          )}

          {/* 提示词 */}
          {task.prompt_boxes && task.prompt_boxes.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">提示词</h3>
              <div className="bg-muted rounded-lg p-4 space-y-2">
                {task.prompt_boxes.filter(box => box.is_activated).map((box, index) => (
                  <div key={box.id} className="text-sm">
                    <span className="text-muted-foreground mr-2">{index + 1}.</span>
                    {box.content || "(空)"}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 使用素材 */}
          {selectedAssetObjects.length > 0 && (
            <div>
              <h3 className="text-sm font-medium mb-2">使用素材</h3>
              <div className="flex flex-wrap gap-2">
                {selectedAssetObjects.map((asset) => (
                  <div
                    key={asset.id}
                    className="bg-muted rounded-lg px-3 py-2 flex items-center gap-2"
                  >
                    {asset.type === "image" || asset.asset_category === "keyframe" ? (
                      <ImageIcon className="w-4 h-4" />
                    ) : (
                      <Music className="w-4 h-4" />
                    )}
                    <span className="text-sm">{asset.display_name || asset.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 生成参数 */}
          {task.params && (
            <div>
              <h3 className="text-sm font-medium mb-2">生成参数</h3>
              <div className="bg-muted rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">时长</span>
                    <p className="font-medium">{task.params.duration}秒</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">画幅</span>
                    <p className="font-medium">{task.params.ratio}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">分辨率</span>
                    <p className="font-medium">{task.params.resolution}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">联网搜索</span>
                    <p className="font-medium">
                      {task.params.tools?.some(t => t.type === "web_search") ? "开启" : "关闭"}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-4 border-t">
            {task.status === "succeeded" && (
              <>
                <Button variant="outline" onClick={handleRollbackAction} className="flex-1 text-orange-500">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  回滚
                </Button>
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  下载
                </Button>
              </>
            )}
            <Button variant="destructive" onClick={handleDeleteAction}>
              <Trash2 className="w-4 h-4 mr-2" />
              删除
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
