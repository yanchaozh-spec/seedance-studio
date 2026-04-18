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
  ChevronLeft,
  Download,
  RotateCcw,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Search,
  AlertCircle,
  Coins,
  Camera,
  Eye,
  Ban,
} from "lucide-react";
import { Task, getTasks, deleteTask, cancelTask, TaskStatus, getVideoUrl } from "@/lib/tasks";
import { getAssets, Asset } from "@/lib/assets";
import { TaskDetailSheet } from "@/components/tasks/TaskDetailSheet";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/lib/settings";
import { formatSeconds } from "@/components/tasks/TaskCard";
import { VideoPlayer } from "@/components/ui/video-player";

// 格式化时长

const statusConfig: Record<TaskStatus, { icon: React.ElementType; label: string; color: string }> = {
  pending: { icon: Clock, label: "等待中", color: "text-gray-500" },
  queued: { icon: Loader2, label: "排队中", color: "text-yellow-500" },
  running: { icon: Loader2, label: "生成中", color: "text-blue-500" },
  succeeded: { icon: CheckCircle, label: "已完成", color: "text-green-500" },
  failed: { icon: XCircle, label: "失败", color: "text-red-500" },
  cancelled: { icon: Ban, label: "已取消", color: "text-gray-400" },
};

// TaskDetailSheet 已移动到 @/components/tasks/TaskDetailSheet

export default function TasksPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TaskStatus>("all");
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());

  useEffect(() => {
    loadData();
  }, [resolvedParams.id]);

  // 轮询1：持续获取任务列表（检测新任务）
  useEffect(() => {
    // 每 3 秒获取一次任务列表（检测新任务）
    const listPollInterval = setInterval(async () => {
      try {
        const tasksData = await getTasks(resolvedParams.id);
        setTasks(tasksData);
      } catch (error) {
        console.error("[列表轮询] 获取任务列表失败:", error);
      }
    }, 3000);

    return () => clearInterval(listPollInterval);
  }, [resolvedParams.id]);

  // 轮询2：持续轮询运行中任务的状态（pending/queued/running）
  useEffect(() => {
    // 收集需要轮询的任务 ID（只轮询运行中的任务）
    const runningTaskIds = tasks
      .filter((t) => t.status === "pending" || t.status === "queued" || t.status === "running")
      .map((t) => t.id);
    
    if (runningTaskIds.length === 0) {
      // 没有运行中的任务，停止轮询
      return;
    }

    // 每3秒轮询一次运行中任务的状态
    const statusPollInterval = setInterval(async () => {
      for (const taskId of runningTaskIds) {
        try {
          // 从设置中获取 API Key
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
          
          const response = await fetch(`/api/tasks/${taskId}/poll`, { headers });
          if (response.ok) {
            const updatedTask = await response.json();
            // 更新任务状态
            setTasks((prev) =>
              prev.map((t) => (t.id === taskId ? { ...t, ...updatedTask } : t))
            );
            // 如果选中任务的详情也需要更新
            if (selectedTask?.id === taskId) {
              setSelectedTask((prev) => (prev ? { ...prev, ...updatedTask } : null));
            }
          }
        } catch (error) {
          console.error(`[状态轮询] 轮询任务 ${taskId} 失败:`, error);
        }
      }
    }, 3000);

    return () => clearInterval(statusPollInterval);
  }, [tasks, selectedTask, resolvedParams.id]);

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

  const handleDelete = async (taskId: string, taskIdExternal?: string) => {
    try {
      await deleteTask(taskId, taskIdExternal);
      setTasks(tasks.filter((t) => t.id !== taskId));
      toast.success("删除成功");
    } catch (error) {
      toast.error("删除失败");
    }
  };

  const handleCancel = async (taskId: string) => {
    try {
      const apiKey = useSettingsStore.getState().arkApiKey;
      const result = await cancelTask(taskId, apiKey);
      if (result.success) {
        setTasks((prev) =>
          prev.map((t) => (t.id === taskId ? { ...t, status: "cancelled" as TaskStatus } : t))
        );
        toast.success("已取消");
      } else {
        toast.error(result.error || "取消失败");
      }
    } catch (error) {
      toast.error("取消请求失败");
    }
  };

  const handleRollback = (task: Task) => {
    // 使用 sessionStorage 传递回滚数据，使用 window.location.href 硬跳转确保 sessionStorage 保留
    if (task.prompt_boxes && task.prompt_boxes.length > 0) {
      const taskData = {
        id: task.id,
        prompt_boxes: task.prompt_boxes,
        selected_assets: task.selected_assets,
        params: task.params,
      };
      sessionStorage.setItem("rollbackTask", JSON.stringify(taskData));
      window.location.href = `/projects/${resolvedParams.id}`;
    }
  };

  // 全局下载处理函数
  const handleDownload = async (task: Task) => {
    const videoUrl = getVideoUrl(task);
    if (!videoUrl) return;
    
    try {
      const response = await fetch(videoUrl);
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

  // 抽帧处理函数 - 抽取当前播放帧
  const handleExtractFrame = async (task: Task) => {
    if (!task.result || !task.result.video_url) return;
    
    // 获取当前视频元素的引用
    const video = videoRefs.current.get(task.id);
    
    if (video) {
      // 确保视频已加载且有有效尺寸
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        toast.error("视频尚未加载完成，请稍后再试");
        return;
      }
      
      try {
        // 创建 canvas 并绘制当前帧
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          throw new Error("无法创建画布");
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // 使用 Promise 包装 toBlob，以便捕获跨域错误
        const blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/png");
        });
        
        if (blob) {
          const formData = new FormData();
          formData.append("file", new File([blob], "frame.png", { type: "image/png" }));
          formData.append("projectId", resolvedParams.id);
          formData.append("taskId", task.id);
          formData.append("timestamp", video.currentTime.toString());
          formData.append("assetCategory", "keyframe");
          formData.append("name", `关键帧_${Date.now()}`);
          
          // 添加 TOS 配置
          const { tosEnabled, tosSettings } = useSettingsStore.getState();
          if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey) {
            formData.append("tos_config", JSON.stringify(tosSettings));
          }
          
          const response = await fetch("/api/assets/extract-frame", {
            method: "POST",
            body: formData,
          });
          
          if (response.ok) {
            const result = await response.json();
            toast.success(`已保存为关键帧: ${result.asset.name}`);
            // 刷新素材列表
            const assetsData = await getAssets(resolvedParams.id);
            setAssets(assetsData);
          } else {
            const error = await response.json();
            toast.error(error.error || "保存失败");
          }
        } else {
          // blob 为 null，表示 canvas 被污染
          await fallbackExtractFrame(task.result.video_url, task.id, video.currentTime);
        }
      } catch (e) {
        // 可能是 canvas 被污染，尝试降级
        await fallbackExtractFrame(task.result.video_url, task.id, video.currentTime);
      }
    } else {
      // 没有视频引用，降级到 API 方式
      await fallbackExtractFrame(task.result.video_url, task.id);
    }
  };

  // API 降级抽帧函数
  const fallbackExtractFrame = async (videoUrl: string, taskId: string, timestamp?: number) => {
    try {
      toast.loading("正在抽帧...", { id: "extract-frame" });
      // 获取 TOS 配置
      const { tosEnabled, tosSettings } = useSettingsStore.getState();
      const requestBody: Record<string, unknown> = {
        video_url: videoUrl,
        project_id: resolvedParams.id,
        task_id: taskId,
        timestamp: timestamp ?? 0,
      };
      if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey) {
        requestBody.tos_config = tosSettings;
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
        return;
      }
      
      const result = await response.json();
      toast.success(`已保存为关键帧: ${result.asset.name}`, { id: "extract-frame" });
      // 刷新素材列表
      const assetsData = await getAssets(resolvedParams.id);
      setAssets(assetsData);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "抽帧失败", { id: "extract-frame" });
    }
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-6 h-full flex flex-col" suppressHydrationWarning>
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
          {tasks.reduce((sum, t) => sum + (t.completion_tokens || 0), 0) > 0 && (
            <div className="flex items-center gap-1.5 text-sm text-yellow-600 bg-yellow-50 rounded-md px-3 py-1.5">
              <Coins className="w-4 h-4" />
              <span>总计 {(tasks.reduce((sum, t) => sum + (t.completion_tokens || 0), 0)).toLocaleString()} tokens</span>
            </div>
          )}
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
              <SelectItem value="cancelled">已取消</SelectItem>
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
                {/* 视频播放器区域 - 水平布局 */}
                {task.status === "succeeded" && getVideoUrl(task) && (
                  <div className="flex gap-4 p-4 bg-black/5">
                    {/* 左侧视频 - 自适应显示，不变形 */}
                    <div className="flex-shrink-0" style={{ width: "140px" }}>
                      <VideoPlayer
                        ref={(el) => {
                          if (el) videoRefs.current.set(task.id, el);
                        }}
                        src={getVideoUrl(task)}
                      />
                    </div>
                    
                    {/* 右侧信息 */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      {/* 状态和ID */}
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-sm text-muted-foreground">{task.id.slice(0, 20)}...</span>
                        <div className="flex items-center gap-2">
                          {task.completion_tokens && (
                            <span className="text-xs text-yellow-600">
                              {task.completion_tokens.toLocaleString()} tokens
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-sm font-medium text-green-500">
                            {(() => {
                              const Icon = statusConfig[task.status].icon;
                              return <Icon className="w-4 h-4" />;
                            })()}
                            {statusConfig[task.status].label}
                          </span>
                        </div>
                      </div>
                      
                      {/* 时间信息 */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>
                          提交: {new Date(task.created_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {task.completed_at && (
                          <span>
                            完成: {new Date(task.completed_at).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                        {task.generation_duration && (
                          <span>耗时: {formatSeconds(task.generation_duration)}</span>
                        )}
                      </div>
                      
                      {/* 操作按钮 */}
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8"
                          onClick={() => setSelectedTask(task)}
                        >
                          <Eye className="w-3.5 h-3.5" />
                          详情
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8"
                          onClick={() => handleExtractFrame(task)}
                        >
                          <Camera className="w-3.5 h-3.5" />
                          抽帧
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8"
                          onClick={() => handleDownload(task)}
                        >
                          <Download className="w-3.5 h-3.5" />
                          下载
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8 text-orange-500"
                          onClick={() => handleRollback(task)}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          回滚
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* 非成功状态的任务 */}
                {task.status !== "succeeded" && (
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-mono text-sm text-muted-foreground">{task.id.slice(0, 20)}...</span>
                      <div className="flex items-center gap-2">
                        {task.completion_tokens && (
                          <span className="text-xs text-yellow-600">
                            {task.completion_tokens.toLocaleString()} tokens
                          </span>
                        )}
                        <span className={cn("flex items-center gap-1 text-sm font-medium", 
                          task.status === "running" ? "text-blue-500" :
                          task.status === "failed" ? "text-red-500" :
                          task.status === "cancelled" ? "text-gray-400" : "text-muted-foreground"
                        )}>
                          {(() => {
                            const Icon = statusConfig[task.status]?.icon || Clock;
                            return task.status === "running" || task.status === "queued" || task.status === "pending" ? (
                              <Icon className="w-4 h-4 animate-spin" />
                            ) : (
                              <Icon className="w-4 h-4" />
                            );
                          })()}
                          {statusConfig[task.status]?.label || task.status}
                        </span>
                      </div>
                    </div>
                    
                    {/* 状态显示 */}
                    {task.status === "running" && (
                      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>生成中...</span>
                      </div>
                    )}
                    {task.status === "queued" && (
                      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
                        <Clock className="w-4 h-4" />
                        <span>排队中</span>
                      </div>
                    )}
                    
                    {/* 错误信息 */}
                    {task.status === "failed" && task.error_message && (
                      <div className="flex items-start gap-2 text-xs text-red-600 bg-red-50 rounded p-2">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <span>{task.error_message}</span>
                      </div>
                    )}
                    
                    {/* 操作按钮 */}
                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 text-xs h-8"
                        onClick={() => setSelectedTask(task)}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        详情
                      </Button>
                      {(task.status === "queued" || task.status === "pending") ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8 text-orange-500"
                          onClick={() => handleCancel(task.id)}
                        >
                          <Ban className="w-3.5 h-3.5" />
                          取消
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs h-8 text-destructive"
                          onClick={() => handleDelete(task.id, task.task_id_external)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          删除
                        </Button>
                      )}
                    </div>
                  </div>
                )}
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
