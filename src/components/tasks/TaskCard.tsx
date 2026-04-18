"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play, RotateCcw, Trash2, Eye, Download, AlertCircle,
  Clock, CheckCircle, XCircle, Loader2, Coins, Sparkles, Camera, Ban
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Task, TaskStatus, getVideoUrl } from "@/lib/tasks";
import { formatDistanceToNow } from "date-fns";
import { zhCN } from "date-fns/locale";
import { VideoPlayer } from "@/components/ui/video-player";

// 任务状态配置
const STATUS_CONFIG: Record<TaskStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: React.ElementType;
}> = {
  pending: {
    label: "等待中",
    color: "text-gray-600",
    bgColor: "bg-gray-100 border-gray-300",
    icon: Clock,
  },
  queued: {
    label: "排队中",
    color: "text-yellow-600",
    bgColor: "bg-yellow-100 border-yellow-300",
    icon: Loader2,
  },
  running: {
    label: "生成中",
    color: "text-blue-600",
    bgColor: "bg-blue-100 border-blue-300",
    icon: Loader2,
  },
  succeeded: {
    label: "已完成",
    color: "text-green-600",
    bgColor: "bg-green-100 border-green-300",
    icon: CheckCircle,
  },
  failed: {
    label: "失败",
    color: "text-red-600",
    bgColor: "bg-red-100 border-red-300",
    icon: XCircle,
  },
  cancelled: {
    label: "已取消",
    color: "text-gray-400",
    bgColor: "bg-gray-50 border-gray-200",
    icon: Ban,
  },
};

// 格式化时长
export function formatSeconds(seconds: number | null | undefined): string {
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

interface TaskCardProps {
  task: Task;
  onPreview?: (task: Task) => void;
  onDownload?: (task: Task) => void;
  onExtractFrame?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onRegenerate?: (task: Task) => void;
  onRollback?: (task: Task) => void;
  showDetails?: boolean;
  compact?: boolean;
  className?: string;
}

export function TaskCard({
  task,
  onPreview,
  onDownload,
  onExtractFrame,
  onDelete,
  onRegenerate,
  onRollback,
  showDetails = true,
  compact = false,
  className,
}: TaskCardProps) {
  const config = STATUS_CONFIG[task.status] || STATUS_CONFIG.pending;
  const StatusIcon = config.icon;

  // 计算排队时长
  const queueDuration = task.queue_duration || calculateQueueDuration(task);
  
  // 计算生成时长
  const generationDuration = task.generation_duration || calculateGenerationDuration(task);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className={cn("p-4", compact ? "p-3" : "p-4")}>
        {/* 头部：状态和操作 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <StatusIcon
              className={cn(
                "w-4 h-4",
                config.color,
                task.status === "running" && "animate-spin"
              )}
            />
            <Badge
              variant="outline"
              className={cn("text-xs", config.bgColor, config.color)}
            >
              {config.label}
            </Badge>
            {task.status === "running" && (
              <span className="text-xs text-muted-foreground animate-pulse">
                生成中...
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {task.status === "succeeded" && (
              <>
                {onPreview && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onPreview(task)}
                    title="预览"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                )}
                {onDownload && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onDownload(task)}
                    title="下载"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                )}
                {onExtractFrame && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onExtractFrame(task)}
                    title="抽帧保存到素材库"
                  >
                    <Camera className="w-4 h-4" />
                  </Button>
                )}
                {task.status === "succeeded" && onRollback && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-orange-500 hover:text-orange-600"
                    onClick={() => onRollback(task)}
                    title="回滚到视频生成"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </Button>
                )}
              </>
            )}
            {(task.status === "failed" || task.status === "succeeded") && onRegenerate && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => onRegenerate(task)}
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
            )}
            {onDelete && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                onClick={() => onDelete(task)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 时间信息 */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
          <span>
            创建: {formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: zhCN })}
          </span>
          {task.completed_at && (
            <span>
              完成: {formatDistanceToNow(new Date(task.completed_at), { addSuffix: true, locale: zhCN })}
            </span>
          )}
        </div>

        {/* Token 消耗信息 */}
        {showDetails && (task.total_tokens || task.completion_tokens) && (
          <div className="flex items-center gap-3 text-xs mb-3 p-2 bg-muted/50 rounded">
            <div className="flex items-center gap-1">
              <Coins className="w-3 h-3 text-yellow-500" />
              <span className="text-muted-foreground">消耗:</span>
            </div>
            {task.completion_tokens && (
              <Badge variant="secondary" className="text-xs">
                <Sparkles className="w-3 h-3 mr-1" />
                {task.completion_tokens.toLocaleString()} tokens
              </Badge>
            )}
            {task.total_tokens && (
              <span className="text-muted-foreground">
                总计: {task.total_tokens.toLocaleString()}
              </span>
            )}
          </div>
        )}

        {/* 耗时信息 */}
        {showDetails && (
          <div className="flex items-center gap-3 text-xs mb-3">
            {queueDuration > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-yellow-500" />
                <span className="text-muted-foreground">排队:</span>
                <span>{formatSeconds(queueDuration)}</span>
              </div>
            )}
            {generationDuration > 0 && (
              <div className="flex items-center gap-1">
                <Play className="w-3 h-3 text-blue-500" />
                <span className="text-muted-foreground">生成:</span>
                <span>{formatSeconds(generationDuration)}</span>
              </div>
            )}
            {(queueDuration > 0 || generationDuration > 0) && (
              <div className="flex items-center gap-1 font-medium">
                <span className="text-muted-foreground">总计:</span>
                <span>{formatSeconds((queueDuration || 0) + (generationDuration || 0))}</span>
              </div>
            )}
          </div>
        )}

        {/* 错误信息 */}
        {task.status === "failed" && task.error_message && (
          <div className="flex items-start gap-2 p-2 bg-destructive/10 rounded text-xs text-destructive mb-3">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span className="line-clamp-2">{task.error_message}</span>
          </div>
        )}

        {/* 状态显示 */}
        {task.status === "running" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>生成中...</span>
          </div>
        )}
        {task.status === "queued" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="w-4 h-4" />
            <span>排队中</span>
          </div>
        )}

        {/* 视频预览 */}
        {task.status === "succeeded" && getVideoUrl(task) && !compact && (
          <div className="mt-3">
            <VideoPlayer
              src={getVideoUrl(task)}
              poster={task.result?.last_frame_url}
            />
          </div>
        )}

        {/* 简短预览（紧凑模式） */}
        {task.status === "succeeded" && getVideoUrl(task) && compact && (
          <div className="mt-2">
            <VideoPlayer
              src={getVideoUrl(task)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// 计算排队时长
function calculateQueueDuration(task: Task): number {
  if (!task.queued_at) return 0;
  const queuedTime = new Date(task.queued_at).getTime();
  const startTime = task.started_at
    ? new Date(task.started_at).getTime()
    : Date.now();
  return Math.round((startTime - queuedTime) / 1000);
}

// 计算生成时长
function calculateGenerationDuration(task: Task): number {
  if (!task.started_at) return 0;
  const startTime = new Date(task.started_at).getTime();
  const endTime = task.completed_at
    ? new Date(task.completed_at).getTime()
    : Date.now();
  return Math.round((endTime - startTime) / 1000);
}

// 任务列表组件
interface TaskListProps {
  tasks: Task[];
  loading?: boolean;
  onPreview?: (task: Task) => void;
  onDownload?: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onRegenerate?: (task: Task) => void;
  showDetails?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function TaskList({
  tasks,
  loading,
  onPreview,
  onDownload,
  onDelete,
  onRegenerate,
  showDetails = true,
  emptyMessage = "暂无任务",
  className,
}: TaskListProps) {
  if (loading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center py-12 text-muted-foreground", className)}>
        <Play className="w-8 h-8 mb-2 opacity-50" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onPreview={onPreview}
          onDownload={onDownload}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          showDetails={showDetails}
        />
      ))}
    </div>
  );
}

// 视频预览弹窗
interface VideoPreviewDialogProps {
  task: Task | null;
  open: boolean;
  onClose: () => void;
}

export function VideoPreviewDialog({ task, open, onClose }: VideoPreviewDialogProps) {
  if (!task || !open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg p-4 max-w-4xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium">视频预览</h3>
            <p className="text-xs text-muted-foreground">
              创建于 {formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: zhCN })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <span className="sr-only">关闭</span>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </Button>
        </div>
        {getVideoUrl(task) && (
          <VideoPlayer
            src={getVideoUrl(task)}
            autoPlay
            className="max-h-[70vh]"
          />
        )}
        <div className="flex items-center gap-2 mt-4">
          {getVideoUrl(task) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const a = document.createElement("a");
                a.href = getVideoUrl(task) || "";
                a.download = `video_${task.id}.mp4`;
                a.click();
              }}
            >
              <Download className="w-4 h-4 mr-1" />
              下载视频
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
