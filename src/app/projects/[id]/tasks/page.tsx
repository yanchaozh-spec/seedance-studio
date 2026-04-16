"use client";

import { useState, useEffect, use, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  MoreVertical,
  Download,
  RotateCcw,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  Image as ImageIcon,
  Music,
  AlertCircle,
  Coins,
  Sparkles,
  Play,
  Camera,
  Film,
} from "lucide-react";
import { Task, getTasks, deleteTask, TaskStatus } from "@/lib/tasks";
import { getAssets, Asset, submitFrameFromCanvas } from "@/lib/assets";
import { TaskCard, TaskList } from "@/components/tasks/TaskCard";
import { formatDistanceToNow, formatDuration } from "date-fns";
import { zhCN } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/settings";
import { formatSeconds } from "@/components/tasks/TaskCard";

// 格式化时长

const statusConfig: Record<TaskStatus, { icon: React.ElementType; label: string; color: string }> = {
  pending: { icon: Clock, label: "等待中", color: "text-gray-500" },
  queued: { icon: Loader2, label: "排队中", color: "text-yellow-500" },
  running: { icon: Loader2, label: "生成中", color: "text-blue-500" },
  succeeded: { icon: CheckCircle, label: "已完成", color: "text-green-500" },
  failed: { icon: XCircle, label: "失败", color: "text-red-500" },
};

interface TaskDetailSheetProps {
  task: Task | null;
  assets: Asset[];
  projectId: string;
  onClose: () => void;
  onRollback: (task: Task) => void;
  onDelete: (taskId: string) => void;
  onAssetCreated?: () => void; // 素材创建后的回调
}

function TaskDetailSheet({ task, assets, projectId, onClose, onRollback, onDelete, onAssetCreated }: TaskDetailSheetProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [showAssetTypeDialog, setShowAssetTypeDialog] = useState(false);

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
    if (!task.result?.video_url) return;
    
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
    }
  };

  const handleRollbackAction = () => {
    onRollback(task);
    onClose();
  };

  // 抽帧保存为素材
  const handleExtractFrame = async (assetCategory: "keyframe" | "image" = "image") => {
    if (!videoRef.current || !task) return;

    const video = videoRef.current;
    
    // 确保视频已加载
    if (video.readyState < 2) {
      toast.error("视频尚未加载完成");
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
      const result = await submitFrameFromCanvas(canvas, projectId, {
        taskId: task.id,
        timestamp: currentTime,
        assetCategory,
        name: `视频帧_${new Date().toLocaleTimeString().replace(/:/g, "-")}`,
      });
      
      toast.success("已保存到素材库");
      onAssetCreated?.();
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
            <span className="text-sm font-normal text-muted-foreground">{task.id}</span>
          </SheetTitle>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* 状态信息 */}
          <div className="flex items-center gap-4">
            <div className={cn("flex items-center gap-2", statusConfig[task.status].color)}>
              {(() => {
                const Icon = statusConfig[task.status].icon;
                return task.status === "running" || task.status === "queued" ? (
                  <Icon className="w-5 h-5 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5" />
                );
              })()}
              <span className="font-medium">{statusConfig[task.status].label}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: zhCN })}
            </span>
          </div>

          {/* Token 消耗信息 */}
          {(task.completion_tokens || task.total_tokens) && (
            <div className="flex items-center gap-4 p-3 bg-yellow-50 rounded-lg">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium">Token 消耗</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                {task.completion_tokens && (
                  <div className="flex items-center gap-1">
                    <Coins className="w-4 h-4 text-yellow-500" />
                    <span className="text-yellow-700 font-medium">
                      {task.completion_tokens.toLocaleString()}
                    </span>
                    <span className="text-yellow-600">tokens</span>
                  </div>
                )}
                {task.total_tokens && (
                  <span className="text-yellow-600">
                    总计: {task.total_tokens.toLocaleString()}
                  </span>
                )}
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
                    <span className="text-xs">排队时长</span>
                  </div>
                  <p className="font-medium">{formatSeconds(task.queue_duration)}</p>
                </div>
              )}
              {task.generation_duration && (
                <div className="bg-muted rounded-lg p-3 text-center">
                  <div className="flex items-center justify-center gap-1 text-blue-600 mb-1">
                    <Play className="w-4 h-4" />
                    <span className="text-xs">生成时长</span>
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
          {task.status === "succeeded" && task.result?.video_url && (
            <div className="space-y-3">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  src={task.result.video_url}
                  controls
                  className="w-full h-full"
                  muted={muted}
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
                  保存当前帧到素材库
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
          <div>
            <h3 className="text-sm font-medium mb-2">提示词</h3>
            <div className="bg-muted rounded-lg p-4 space-y-2">
              {task.prompt_boxes.map((box, index) => (
                <div key={box.id} className="text-sm">
                  <span className="text-muted-foreground mr-2">{index + 1}.</span>
                  {box.content || "(空)"}
                </div>
              ))}
            </div>
          </div>

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
                    {asset.type === "image" ? (
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
                <div className="grid grid-cols-3 gap-4 text-sm">
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
                </div>
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3 pt-4 border-t">
            {task.status === "succeeded" && (
              <>
                <Button variant="outline" onClick={handleRollbackAction} className="flex-1">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  回滚
                </Button>
                <Button onClick={handleDownload} className="flex-1">
                  <Download className="w-4 h-4 mr-2" />
                  下载
                </Button>
              </>
            )}
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(task.id);
                onClose();
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              删除
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    loadData();
  }, [resolvedParams.id]);

  // 轮询运行中的任务状态
  useEffect(() => {
    const runningTasks = tasks.filter(
      (t) => t.status === "pending" || t.status === "queued" || t.status === "running"
    );
    
    if (runningTasks.length === 0) return;

    const pollInterval = setInterval(async () => {
      for (const task of runningTasks) {
        try {
          // 从设置中获取 API Key
          const apiKey = useSettingsStore.getState().arkApiKey;
          
          const headers: Record<string, string> = {};
          if (apiKey) {
            headers["x-ark-api-key"] = apiKey;
          }
          
          const response = await fetch(`/api/tasks/${task.id}/poll`, { headers });
          if (response.ok) {
            const updatedTask = await response.json();
            setTasks((prev) =>
              prev.map((t) => (t.id === task.id ? { ...t, ...updatedTask } : t))
            );
            // 如果选中任务的详情也需要更新
            if (selectedTask?.id === task.id) {
              setSelectedTask((prev) => (prev ? { ...prev, ...updatedTask } : null));
            }
          }
        } catch (error) {
          console.error(`轮询任务 ${task.id} 失败:`, error);
        }
      }
    }, 3000); // 每3秒轮询一次

    return () => clearInterval(pollInterval);
  }, [tasks, selectedTask]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksData, assetsData] = await Promise.all([
        getTasks(resolvedParams.id),
        getAssets(resolvedParams.id),
      ]);
      setTasks(tasksData);
      setAssets(assetsData);
    } catch (error) {
      console.error("加载数据失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      setTasks(tasks.filter((t) => t.id !== taskId));
      toast.success("删除成功");
    } catch (error) {
      toast.error("删除失败");
    }
  };

  const handleRollback = (task: Task) => {
    // 将任务数据保存到 sessionStorage，供视频生成页面读取
    sessionStorage.setItem("rollbackTask", JSON.stringify(task));
    router.push(`/projects/${resolvedParams.id}`);
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/projects/${resolvedParams.id}`)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">任务管理</h1>
            <p className="text-muted-foreground text-sm mt-1">共 {tasks.length} 个任务</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索任务ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="pending">等待中</SelectItem>
              <SelectItem value="queued">排队中</SelectItem>
              <SelectItem value="running">生成中</SelectItem>
              <SelectItem value="succeeded">已完成</SelectItem>
              <SelectItem value="failed">失败</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Clock className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无任务</h3>
            <p className="text-muted-foreground">在视频生成页面创建任务</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredTasks.map((task) => (
              <div key={task.id} className="bg-card border rounded-lg overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setSelectedTask(task)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-mono text-sm">{task.id.slice(0, 20)}...</span>
                        <div className={cn("flex items-center gap-1", statusConfig[task.status].color)}>
                          {(() => {
                            const Icon = statusConfig[task.status].icon;
                            return task.status === "running" ? (
                              <Icon className="w-4 h-4 animate-spin" />
                            ) : (
                              <Icon className="w-4 h-4" />
                            );
                          })()}
                          <span className="text-sm">{statusConfig[task.status].label}</span>
                        </div>
                        {/* Token 消耗 */}
                        {task.completion_tokens && (
                          <div className="flex items-center gap-1 text-xs text-yellow-600">
                            <Sparkles className="w-3 h-3" />
                            <span>{task.completion_tokens.toLocaleString()}</span>
                          </div>
                        )}
                        {/* 耗时 */}
                        {(task.queue_duration || task.generation_duration) && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            {task.queue_duration && (
                              <>
                                <Clock className="w-3 h-3" />
                                <span>排队 {formatSeconds(task.queue_duration)}</span>
                              </>
                            )}
                            {task.generation_duration && (
                              <>
                                <Play className="w-3 h-3" />
                                <span>生成 {formatSeconds(task.generation_duration)}</span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          创建: {formatDistanceToNow(new Date(task.created_at), { addSuffix: true, locale: zhCN })}
                        </span>
                        {task.completed_at && (
                          <span>
                            完成: {formatDistanceToNow(new Date(task.completed_at), { addSuffix: true, locale: zhCN })}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* 操作菜单 */}
                    <div className="flex items-center gap-1">
                      {task.status === "succeeded" && task.result?.video_url && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(task);
                          }}
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {task.status === "succeeded" && (
                            <>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setSelectedTask(task); }}>
                                查看详情
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleRollback(task); }}>
                                <RotateCcw className="w-4 h-4 mr-2" />
                                回滚
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            删除
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {/* 进度条 */}
                  {task.status === "running" && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-muted-foreground">生成进度</span>
                        <span>{task.progress || 0}%</span>
                      </div>
                      <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all"
                          style={{ width: `${task.progress || 0}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {/* 错误信息 */}
                  {task.status === "failed" && task.error_message && (
                    <div className="mt-2 flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded p-2">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{task.error_message}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 任务详情抽屉 */}
      <TaskDetailSheet
        task={selectedTask}
        assets={assets}
        projectId={resolvedParams.id}
        onClose={() => setSelectedTask(null)}
        onRollback={handleRollback}
        onDelete={handleDelete}
        onAssetCreated={loadData}
      />
    </div>
  );
}
