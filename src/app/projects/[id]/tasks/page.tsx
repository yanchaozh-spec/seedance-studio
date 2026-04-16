"use client";

import { useState, useEffect, use } from "react";
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
} from "lucide-react";
import { Task, getTasks, deleteTask, TaskStatus } from "@/lib/tasks";
import { getAssets, Asset } from "@/lib/assets";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const statusConfig: Record<TaskStatus, { icon: React.ElementType; label: string; color: string }> = {
  queued: { icon: Clock, label: "排队中", color: "text-muted-foreground" },
  running: { icon: Loader2, label: "生成中", color: "text-blue-500" },
  succeeded: { icon: CheckCircle, label: "已完成", color: "text-green-500" },
  failed: { icon: XCircle, label: "失败", color: "text-red-500" },
};

interface TaskDetailSheetProps {
  task: Task | null;
  assets: Asset[];
  onClose: () => void;
  onRollback: (task: Task) => void;
  onDelete: (taskId: string) => void;
}

function TaskDetailSheet({ task, assets, onClose, onRollback, onDelete }: TaskDetailSheetProps) {
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

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
                return task.status === "running" ? (
                  <Icon className="w-5 h-5 animate-spin" />
                ) : (
                  <Icon className="w-5 h-5" />
                );
              })()}
              <span className="font-medium">{statusConfig[task.status].label}</span>
            </div>
            <span className="text-sm text-muted-foreground">
              {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
            </span>
          </div>

          {/* 视频播放器 */}
          {task.status === "succeeded" && task.result?.video_url && (
            <div className="space-y-3">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  src={task.result.video_url}
                  controls
                  className="w-full h-full"
                  volume={volume}
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
                    setVolume(parseFloat(e.target.value));
                    if (parseFloat(e.target.value) > 0) setMuted(false);
                  }}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-8">
                  {Math.round((muted ? 0 : volume) * 100)}%
                </span>
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
          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr className="text-left text-sm">
                  <th className="px-4 py-3 font-medium">任务ID</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium">进度</th>
                  <th className="px-4 py-3 font-medium">时间</th>
                  <th className="px-4 py-3 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedTask(task)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm">{task.id.slice(0, 20)}...</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className={cn("flex items-center gap-2", statusConfig[task.status].color)}>
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
                    </td>
                    <td className="px-4 py-3">
                      {task.status === "running" ? (
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground">{task.progress}%</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                      </span>
                    </td>
                    <td className="px-4 py-3">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 任务详情抽屉 */}
      <TaskDetailSheet
        task={selectedTask}
        assets={assets}
        onClose={() => setSelectedTask(null)}
        onRollback={handleRollback}
        onDelete={handleDelete}
      />
    </div>
  );
}
