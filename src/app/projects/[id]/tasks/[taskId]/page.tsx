"use client";

import { useState, useEffect, useRef } from "react";
import { use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ChevronLeft,
  Download,
  RotateCcw,
  Camera,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  AlertCircle,
  Coins,
  Sparkles,
  Image as ImageIcon,
  Film,
  Loader,
  Copy,
  ArrowLeft,
} from "lucide-react";
import { Task, getTask, TaskStatus, getVideoUrl } from "@/lib/tasks";
import { getAssets, Asset, submitFrameFromCanvas } from "@/lib/assets";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VideoPlayer } from "@/components/ui/video-player";

// 状态配置
const STATUS_CONFIG: Record<TaskStatus, {
  label: string;
  color: string;
  icon: React.ElementType;
}> = {
  pending: { label: "等待中", color: "text-gray-600", icon: Clock },
  queued: { label: "排队中", color: "text-yellow-600", icon: Loader2 },
  running: { label: "生成中", color: "text-blue-600", icon: Loader2 },
  succeeded: { label: "已完成", color: "text-green-600", icon: CheckCircle },
  failed: { label: "失败", color: "text-red-600", icon: XCircle },
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

interface TaskDetailPageProps {
  params: Promise<{ id: string; taskId: string }>;
}

export default function TaskDetailPage({ params }: TaskDetailPageProps) {
  const resolvedParams = use(params);
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [task, setTask] = useState<Task | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [downloading, setDownloading] = useState(false);

  // 加载数据
  const loadData = async () => {
    try {
      setLoading(true);
      const [taskData, assetsData] = await Promise.all([
        getTask(resolvedParams.taskId),
        getAssets(resolvedParams.id),
      ]);
      setTask(taskData);
      setAssets(assetsData);
    } catch (error) {
      console.error("Failed to load data:", error);
      toast.error("加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [resolvedParams.taskId]);

  // 轮询任务状态
  useEffect(() => {
    if (!task || task.status === "succeeded" || task.status === "failed") return;

    const interval = setInterval(async () => {
      try {
        const updatedTask = await getTask(resolvedParams.taskId);
        if (updatedTask) {
          setTask(updatedTask);
          if (updatedTask.status === "succeeded" || updatedTask.status === "failed") {
            clearInterval(interval);
          }
        }
      } catch (error) {
        console.error("Polling error:", error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [task?.status, resolvedParams.taskId]);

  // 音量控制
  const handleVolumeChange = (newVolume: number) => {
    setVolume(newVolume);
    if (videoRef.current) {
      videoRef.current.volume = newVolume;
    }
  };

  // 下载视频
  const handleDownload = async () => {
    if (!task?.result?.video_url) return;
    
    setDownloading(true);
    try {
      const response = await fetch(task.result.video_url);
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
    } finally {
      setDownloading(false);
    }
  };

  // 复制视频链接
  const handleCopyLink = async () => {
    if (!task?.result?.video_url) return;
    await navigator.clipboard.writeText(task.result.video_url);
    toast.success("链接已复制");
  };

  // 抽帧保存为素材
  const handleExtractFrame = async (assetCategory: "keyframe" | "image" = "image") => {
    if (!videoRef.current || !task) return;

    const video = videoRef.current;
    
    if (video.readyState < 2) {
      toast.error("视频尚未加载完成");
      return;
    }

    setExtracting(true);
    
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("无法创建 canvas 上下文");
      }
      
      const currentTime = video.currentTime;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      const result = await submitFrameFromCanvas(canvas, resolvedParams.id, {
        taskId: task.id,
        timestamp: currentTime,
        assetCategory,
        name: `视频帧_${new Date().toLocaleTimeString().replace(/:/g, "-")}`,
      });
      
      toast.success("已保存到素材库");
    } catch (error) {
      console.error("抽帧失败:", error);
      toast.error(error instanceof Error ? error.message : "抽帧失败");
    } finally {
      setExtracting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-100px)]">
        <Loader className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-100px)] gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-lg">任务不存在</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回
        </Button>
      </div>
    );
  }

  const config = STATUS_CONFIG[task.status];
  const StatusIcon = config.icon;
  const selectedAssetObjects = task.selected_assets
    .map((id) => assets.find((a) => a.id === id))
    .filter(Boolean) as Asset[];

  return (
    <div className="container mx-auto py-6 max-w-4xl" suppressHydrationWarning>
      {/* 顶部导航 */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          返回
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">任务详情</h1>
          <p className="text-sm text-muted-foreground font-mono">{task.id}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* 状态标签 */}
          <div className={cn("flex items-center gap-2 px-3 py-1.5 rounded-full", config.color)}>
            {task.status === "running" || task.status === "queued" ? (
              <StatusIcon className="w-4 h-4 animate-spin" />
            ) : (
              <StatusIcon className="w-4 h-4" />
            )}
            <span className="font-medium text-sm">{config.label}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：视频预览 */}
        <div className="lg:col-span-2 space-y-4">
          {/* 视频播放器 */}
          {task.status === "succeeded" && getVideoUrl(task) ? (
            <Card>
              <CardContent className="p-4">
                <div className="space-y-4">
                  {/* 自适应视频播放器，9:16 竖屏不会被放大 */}
                  <div className="bg-black rounded-lg overflow-hidden relative" style={{ height: "400px" }}>
                    <VideoPlayer
                      ref={videoRef}
                      src={getVideoUrl(task)}
                      muted={muted}
                      poster={task.result?.last_frame_url}
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                  </div>
                  
                  {/* 视频控制栏 */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setMuted(!muted)}
                        className="p-2 hover:bg-accent rounded-lg transition-colors"
                      >
                        {muted ? (
                          <VolumeX className="w-5 h-5" />
                        ) : (
                          <Volume2 className="w-5 h-5" />
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
                        className="w-24"
                      />
                      <span className="text-sm text-muted-foreground w-12">
                        {Math.round((muted ? 0 : volume) * 100)}%
                      </span>
                    </div>
                    
                    <div className="flex-1" />
                    
                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownload}
                        disabled={downloading}
                      >
                        {downloading ? (
                          <Loader className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4 mr-2" />
                        )}
                        下载
                      </Button>
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" disabled={extracting}>
                            <Camera className="w-4 h-4 mr-2" />
                            抽帧
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
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={handleCopyLink}>
                            <Copy className="w-4 h-4 mr-2" />
                            复制视频链接
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : task.status === "running" || task.status === "queued" ? (
            <Card>
              <CardContent className="p-8 flex flex-col items-center justify-center">
                <Loader className="w-12 h-12 animate-spin text-primary mb-4" />
                <p className="text-lg font-medium">
                  {task.status === "queued" ? "任务排队中..." : "视频生成中..."}
                </p>
                {task.progress !== undefined && (
                  <div className="w-full max-w-xs mt-4">
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${task.progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground text-center mt-2">
                      {task.progress}% 完成
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : task.status === "failed" ? (
            <Card className="border-destructive">
              <CardContent className="p-8 flex flex-col items-center justify-center">
                <XCircle className="w-12 h-12 text-destructive mb-4" />
                <p className="text-lg font-medium text-destructive">生成失败</p>
                {task.error_message && (
                  <p className="text-sm text-muted-foreground mt-2 text-center max-w-md">
                    {task.error_message}
                  </p>
                )}
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => router.back()}
                >
                  <RotateCcw className="w-4 h-4 mr-2" />
                  重新生成
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-8 flex flex-col items-center justify-center">
                <Clock className="w-12 h-12 text-muted-foreground mb-4" />
                <p className="text-lg text-muted-foreground">等待处理...</p>
              </CardContent>
            </Card>
          )}

          {/* 提示词 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">提示词</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {task.prompt_boxes.map((box, index) => (
                  <div key={box.id} className="bg-muted rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <span className="text-sm font-medium text-muted-foreground">
                        {index + 1}.
                      </span>
                      <p className="text-sm flex-1">{box.content || "(空)"}</p>
                    </div>
                    {box.activated_asset_id && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        激活素材: {box.activated_asset_id}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 使用素材 */}
          {selectedAssetObjects.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">使用素材</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-3">
                  {selectedAssetObjects.map((asset) => (
                    <div key={asset.id} className="relative aspect-square rounded-lg overflow-hidden border bg-muted flex items-center justify-center">
                      {asset.type === "audio" ? (
                        <div className="w-full h-full flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">音频</span>
                        </div>
                      ) : (
                        <img
                          src={asset.thumbnail_url || asset.url}
                          alt={asset.display_name || asset.name}
                          className="max-w-full max-h-full object-contain"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* 右侧：任务信息 */}
        <div className="space-y-4">
          {/* 基本信息 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">创建时间</span>
                <span>{formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: zhCN })}</span>
              </div>
              {task.completed_at && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">完成时间</span>
                  <span>{formatDistanceToNow(new Date(task.completed_at), { addSuffix: true, locale: zhCN })}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">视频时长</span>
                <span>{task.result?.duration || task.params?.duration || 5}秒</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">分辨率</span>
                <span>{task.result?.resolution || task.params?.resolution || "720p"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">画幅</span>
                <span>{task.params?.ratio || "16:9"}</span>
              </div>
            </CardContent>
          </Card>

          {/* 耗时统计 */}
          {(task.queue_duration || task.generation_duration) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">耗时统计</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3">
                  {task.queue_duration && (
                    <div className="bg-yellow-50 rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-yellow-600 mb-1">
                        <Clock className="w-4 h-4" />
                        <span className="text-xs">排队</span>
                      </div>
                      <p className="font-medium">{formatSeconds(task.queue_duration)}</p>
                    </div>
                  )}
                  {task.generation_duration && (
                    <div className="bg-blue-50 rounded-lg p-3 text-center">
                      <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                        <Play className="w-4 h-4" />
                        <span className="text-xs">生成</span>
                      </div>
                      <p className="font-medium">{formatSeconds(task.generation_duration)}</p>
                    </div>
                  )}
                  {(task.queue_duration || task.generation_duration) && (
                    <div className="col-span-2 bg-green-50 rounded-lg p-3 text-center">
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
              </CardContent>
            </Card>
          )}

          {/* Token 消耗 */}
          {(task.completion_tokens || task.total_tokens) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-yellow-500" />
                  Token 消耗
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {task.completion_tokens && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Completion</span>
                    <span className="font-medium">{task.completion_tokens.toLocaleString()}</span>
                  </div>
                )}
                {task.total_tokens && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">总计</span>
                    <span className="font-medium">{task.total_tokens.toLocaleString()}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
