"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Plus, X, Play, Pause, RotateCcw, Check, AlertCircle,
  Film, Clock, Settings2, ChevronDown, ChevronUp, Trash2,
  Volume2, Download, Eye
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VideoSegment,
  LongVideo,
  SegmentConfig,
  createLongVideoProject,
  generateSegment,
  confirmSegment,
  regenerateSegment,
  getSegments,
  addSegment,
  deleteSegment,
  mergeSegments,
  pollSegmentStatus,
  SegmentPrompt,
} from "@/lib/long-videos";
import { useSettingsStore } from "@/lib/settings";
import { Asset } from "@/lib/assets";
import { toast } from "sonner";

interface SegmentEditorProps {
  segment: VideoSegment;
  index: number;
  isActive: boolean;
  assets: Asset[];
  onActivate: () => void;
  onUpdate: (updates: Partial<SegmentConfig>) => void;
  onGenerate: () => void;
  onConfirm: () => void;
  onRegenerate: () => void;
  onPreview: () => void;
  onDelete: () => void;
  disabled: boolean;
}

function SegmentEditor({
  segment,
  index,
  isActive,
  assets,
  onActivate,
  onUpdate,
  onGenerate,
  onConfirm,
  onRegenerate,
  onPreview,
  onDelete,
  disabled,
}: SegmentEditorProps) {
  const [expanded, setExpanded] = useState(isActive);
  const [prompts, setPrompts] = useState<SegmentPrompt[]>(
    segment.prompt_content || [{ id: "1", content: "", isActivated: true, order: 0 }]
  );

  useEffect(() => {
    setExpanded(isActive);
  }, [isActive]);

  const addPrompt = () => {
    const newPrompt: SegmentPrompt = {
      id: Date.now().toString(),
      content: "",
      isActivated: true,
      order: prompts.length,
    };
    setPrompts([...prompts, newPrompt]);
  };

  const updatePrompt = (id: string, content: string) => {
    setPrompts(prompts.map(p => p.id === id ? { ...p, content } : p));
    onUpdate({ prompts: prompts.map(p => p.id === id ? { ...p, content } : p) });
  };

  const removePrompt = (id: string) => {
    if (prompts.length <= 1) return;
    const updated = prompts.filter(p => p.id !== id).map((p, i) => ({ ...p, order: i }));
    setPrompts(updated);
    onUpdate({ prompts: updated });
  };

  const statusColors: Record<string, string> = {
    pending: "bg-gray-100 border-gray-300 text-gray-600",
    running: "bg-blue-100 border-blue-300 text-blue-700",
    waiting_confirm: "bg-yellow-100 border-yellow-300 text-yellow-700",
    confirmed: "bg-green-100 border-green-300 text-green-700",
    failed: "bg-red-100 border-red-300 text-red-700",
  };

  const statusLabels: Record<string, string> = {
    pending: "待生成",
    running: "生成中",
    waiting_confirm: "待确认",
    confirmed: "已确认",
    failed: "失败",
  };

  const isGenerating = segment.status === "running";
  const isWaitingConfirm = segment.status === "waiting_confirm";
  const isConfirmed = segment.status === "confirmed";
  const isFailed = segment.status === "failed";
  const canEdit = segment.status === "pending" || segment.status === "failed";

  return (
    <Card
      className={cn(
        "transition-all duration-200",
        isActive && "ring-2 ring-primary",
        segment.status === "running" && "animate-pulse"
      )}
    >
      <CardHeader className="p-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setExpanded(!expanded);
              onActivate();
            }}
            className="flex items-center gap-2 flex-1 text-left"
          >
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">
              {index + 1}
            </span>
            <span className="font-medium">段 {index + 1}</span>
            <Badge
              variant="outline"
              className={cn("text-xs", statusColors[segment.status])}
            >
              {statusLabels[segment.status] || segment.status}
            </Badge>
            {segment.first_frame_url && (
              <span className="text-xs text-muted-foreground">有首帧</span>
            )}
            {expanded ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          <div className="flex items-center gap-1">
            {segment.video_url && (
              <Button variant="ghost" size="icon" onClick={onPreview}>
                <Eye className="w-4 h-4" />
              </Button>
            )}
            {!isConfirmed && (
              <Button variant="ghost" size="icon" onClick={onDelete} disabled={disabled}>
                <Trash2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* 快速操作按钮 */}
        {!expanded && (
          <div className="flex items-center gap-2 mt-2 pl-8">
            {canEdit && (
              <Button size="sm" variant="outline" onClick={onGenerate} disabled={disabled}>
                <Play className="w-3 h-3 mr-1" />
                生成
              </Button>
            )}
            {isWaitingConfirm && (
              <>
                <Button size="sm" variant="outline" onClick={onRegenerate}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  重新生成
                </Button>
                <Button size="sm" onClick={onConfirm}>
                  <Check className="w-3 h-3 mr-1" />
                  确认
                </Button>
              </>
            )}
            {isConfirmed && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <Check className="w-3 h-3" />
                已确认，使用尾帧作为下一段首帧
              </span>
            )}
            {isFailed && (
              <span className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {segment.error_message || "生成失败"}
              </span>
            )}
          </div>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="p-3 pt-0 space-y-4">
          {/* 提示词编辑 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">提示词</label>
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={addPrompt}>
                  <Plus className="w-3 h-3 mr-1" />
                  添加
                </Button>
              )}
            </div>

            {prompts.map((prompt) => (
              <div key={prompt.id} className="flex gap-2">
                <Textarea
                  placeholder="输入提示词..."
                  value={prompt.content}
                  onChange={(e) => {
                    updatePrompt(prompt.id, e.target.value);
                  }}
                  disabled={!canEdit}
                  className="min-h-[60px] text-sm"
                />
                {prompts.length > 1 && canEdit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePrompt(prompt.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>

          {/* 参数设置 */}
          <div className="grid grid-cols-4 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                时长
              </label>
              <Select
                value={String(segment.segment_duration || 5)}
                onValueChange={(v) => onUpdate({ duration: parseInt(v) })}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) => (
                    <SelectItem key={d} value={String(d)}>{d}秒</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">画幅</label>
              <Select
                value={segment.segment_ratio || "16:9"}
                onValueChange={(v) => onUpdate({ ratio: v })}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="1:1">1:1</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">分辨率</label>
              <Select
                value={segment.segment_resolution || "720p"}
                onValueChange={(v) => onUpdate({ resolution: v })}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                音频
              </label>
              <Select
                value={segment.segment_generate_audio ? "true" : "false"}
                onValueChange={(v) => onUpdate({ generateAudio: v === "true" })}
                disabled={!canEdit}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">生成</SelectItem>
                  <SelectItem value="false">不生成</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 首帧预览 */}
          {segment.first_frame_url && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">首帧</label>
              <img
                src={segment.first_frame_url}
                alt="首帧"
                className="w-32 h-20 object-cover rounded border"
              />
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-2">
            {canEdit && (
              <Button onClick={onGenerate} disabled={disabled}>
                <Play className="w-3 h-3 mr-1" />
                生成
              </Button>
            )}
            {isWaitingConfirm && (
              <>
                <Button variant="outline" onClick={onRegenerate}>
                  <RotateCcw className="w-3 h-3 mr-1" />
                  重新生成
                </Button>
                <Button onClick={onConfirm}>
                  <Check className="w-3 h-3 mr-1" />
                  确认并继续
                </Button>
              </>
            )}
            {isConfirmed && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <Check className="w-4 h-4" />
                已确认，尾帧将作为下一段首帧
              </span>
            )}
            {isFailed && (
              <span className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {segment.error_message || "生成失败"}
              </span>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

interface SegmentPreviewDialogProps {
  segment: VideoSegment | null;
  open: boolean;
  onClose: () => void;
}

function SegmentPreviewDialog({ segment, open, onClose }: SegmentPreviewDialogProps) {
  if (!segment) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-center justify-center bg-black/50",
        !open && "hidden"
      )}
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg p-4 max-w-3xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">段 {segment.segment_index + 1} 预览</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>
        {segment.video_url && (
          <video
            src={segment.video_url}
            controls
            autoPlay
            className="w-full rounded"
          />
        )}
      </div>
    </div>
  );
}

interface LongVideoEditorProps {
  projectId: string;
  assets: Asset[];
  onBack?: () => void;
}

export function LongVideoEditor({ projectId, assets, onBack }: LongVideoEditorProps) {
  const { arkApiKey } = useSettingsStore();
  const [longVideo, setLongVideo] = useState<LongVideo | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [previewSegment, setPreviewSegment] = useState<VideoSegment | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 创建新的长视频项目
  const createNewProject = useCallback(async () => {
    try {
      setLoading(true);
      const result = await createLongVideoProject({
        project_id: projectId,
        segments: [
          {
            prompts: [{ id: "1", content: "", isActivated: true, order: 0 }],
            selectedAssets: [],
            duration: 5,
            ratio: "16:9",
            resolution: "720p",
            generateAudio: true,
          },
        ],
      });

      setLongVideo({
        id: result.id,
        project_id: projectId,
        status: "pending",
        progress: 0,
        completed_segments: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      setSegments(result.segments);
      setActiveSegmentIndex(0);
      toast.success("长视频项目已创建");
    } catch (error) {
      console.error("创建失败:", error);
      toast.error("创建长视频项目失败");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // 添加新分段
  const handleAddSegment = async () => {
    if (!longVideo) return;

    try {
      setLoading(true);
      const result = await addSegment(longVideo.id, {
        prompts: [{ id: "1", content: "", isActivated: true, order: 0 }],
        selectedAssets: [],
        duration: 5,
        ratio: "16:9",
        resolution: "720p",
        generateAudio: true,
      });

      setSegments(result.segments);
      setActiveSegmentIndex(result.segments.length - 1);
      toast.success("已添加新分段");
    } catch (error) {
      console.error("添加分段失败:", error);
      toast.error("添加分段失败");
    } finally {
      setLoading(false);
    }
  };

  // 更新分段配置
  const handleUpdateSegment = async (segmentId: string, updates: Partial<SegmentConfig>) => {
    try {
      await fetch(`/api/long-videos/segments/${segmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompts: updates.prompts,
          selectedAssets: updates.selectedAssets,
          duration: updates.duration,
          ratio: updates.ratio,
          resolution: updates.resolution,
          generateAudio: updates.generateAudio,
        }),
      });

      // 乐观更新本地状态
      setSegments((prev) =>
        prev.map((s) => {
          if (s.id === segmentId) {
            return {
              ...s,
              prompt_content: updates.prompts || s.prompt_content,
              asset_ids: updates.selectedAssets || s.asset_ids,
              segment_duration: updates.duration || s.segment_duration,
              segment_ratio: updates.ratio || s.segment_ratio,
              segment_resolution: updates.resolution || s.segment_resolution,
              segment_generate_audio: updates.generateAudio ?? s.segment_generate_audio,
            };
          }
          return s;
        })
      );
    } catch (error) {
      console.error("更新分段失败:", error);
      toast.error("更新分段配置失败");
    }
  };

  // 生成单个分段
  const handleGenerateSegment = async (segmentId: string) => {
    try {
      const result = await generateSegment({ segment_id: segmentId }, arkApiKey);

      // 更新分段状态
      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId ? { ...s, status: "running", task_id: result.task_id } : s
        )
      );

      toast.success("开始生成视频...");

      // 开始轮询
      startPolling(segmentId);
    } catch (error) {
      console.error("生成失败:", error);
      toast.error("生成视频失败");
    }
  };

  // 轮询分段状态
  const startPolling = (segmentId: string) => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
    }

    pollingRef.current = setInterval(async () => {
      try {
        const videoData = await getSegments(longVideo!.id);
        const segment = videoData.segments.find((s) => s.id === segmentId);

        if (segment) {
          setSegments((prev) =>
            prev.map((s) => (s.id === segmentId ? segment : s))
          );

          // 更新长视频状态
          if (videoData.long_video) {
            setLongVideo(videoData.long_video);
          }

          // 检查是否需要停止轮询
          if (segment.status === "waiting_confirm" || segment.status === "failed") {
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        }
      } catch (error) {
        console.error("轮询失败:", error);
      }
    }, 3000);
  };

  // 确认分段
  const handleConfirmSegment = async (segmentId: string) => {
    try {
      setLoading(true);
      const result = await confirmSegment(segmentId);

      setLongVideo(result.long_video);
      setSegments(result.segments);

      toast.success("已确认，继续生成下一段");
    } catch (error) {
      console.error("确认失败:", error);
      toast.error("确认分段失败");
    } finally {
      setLoading(false);
    }
  };

  // 重新生成分段
  const handleRegenerateSegment = async (segmentId: string) => {
    try {
      const result = await regenerateSegment(segmentId, arkApiKey);

      setSegments((prev) =>
        prev.map((s) =>
          s.id === segmentId ? { ...s, status: "running", task_id: result.task_id } : s
        )
      );

      toast.success("开始重新生成...");

      // 开始轮询
      startPolling(segmentId);
    } catch (error) {
      console.error("重新生成失败:", error);
      toast.error("重新生成失败");
    }
  };

  // 删除分段
  const handleDeleteSegment = async (segmentId: string) => {
    try {
      const result = await deleteSegment(segmentId);

      if (result.long_video_deleted) {
        setLongVideo(null);
        setSegments([]);
        toast.success("长视频项目已删除");
      } else {
        setSegments(result.segments || []);
        if (activeSegmentIndex >= (result.segments?.length || 0)) {
          setActiveSegmentIndex(Math.max(0, (result.segments?.length || 1) - 1));
        }
        toast.success("分段已删除");
      }
    } catch (error) {
      console.error("删除失败:", error);
      toast.error("删除分段失败");
    }
  };

  // 合并所有分段
  const handleMergeSegments = async () => {
    if (!longVideo) return;

    try {
      setLoading(true);
      await mergeSegments(longVideo.id, arkApiKey);

      toast.success("开始合并视频...");

      // 轮询合并状态
      pollingRef.current = setInterval(async () => {
        try {
          const videoData = await getSegments(longVideo!.id);
          if (videoData.long_video) {
            setLongVideo(videoData.long_video);

            if (videoData.long_video.status === "completed") {
              toast.success("长视频生成完成！");
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
            } else if (videoData.long_video.status === "failed") {
              toast.error(`合并失败: ${videoData.long_video.error_message}`);
              if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
              }
            }
          }
        } catch (error) {
          console.error("轮询失败:", error);
        }
      }, 5000);
    } catch (error) {
      console.error("合并失败:", error);
      toast.error("合并视频失败");
    } finally {
      setLoading(false);
    }
  };

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // 如果没有长视频项目，显示创建界面
  if (!longVideo) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Film className="w-16 h-16 text-muted-foreground" />
        <h2 className="text-xl font-medium">长视频编辑器</h2>
        <p className="text-muted-foreground text-center max-w-md">
          创建长视频项目，逐段生成视频，确认后自动将尾帧作为下一段首帧
        </p>
        <Button onClick={createNewProject} disabled={loading} size="lg">
          <Plus className="w-4 h-4 mr-2" />
          创建新长视频
        </Button>
      </div>
    );
  }

  const allConfirmed = segments.every((s) => s.status === "confirmed");
  const confirmedCount = segments.filter((s) => s.status === "confirmed").length;
  const progress = segments.length > 0 ? Math.round((confirmedCount / segments.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" onClick={onBack}>
              返回
            </Button>
          )}
          <h2 className="text-lg font-medium">长视频编辑器</h2>
          <Badge variant="outline">
            {confirmedCount}/{segments.length} 段已确认
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleAddSegment} disabled={loading}>
            <Plus className="w-3 h-3 mr-1" />
            添加分段
          </Button>
          {allConfirmed && (
            <Button onClick={handleMergeSegments} disabled={loading}>
              <Film className="w-3 h-3 mr-1" />
              合并视频
            </Button>
          )}
        </div>
      </div>

      {/* 进度条 */}
      {segments.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">
              {longVideo.status === "merging" && "正在合并视频..."}
              {longVideo.status === "completed" && "生成完成！"}
              {longVideo.status !== "merging" && longVideo.status !== "completed" && `进度`}
            </span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      {/* 分段列表 */}
      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-3 pr-4">
          {segments.map((segment, index) => (
            <SegmentEditor
              key={segment.id}
              segment={segment}
              index={index}
              isActive={index === activeSegmentIndex}
              assets={assets}
              onActivate={() => setActiveSegmentIndex(index)}
              onUpdate={(updates) => handleUpdateSegment(segment.id, updates)}
              onGenerate={() => handleGenerateSegment(segment.id)}
              onConfirm={() => handleConfirmSegment(segment.id)}
              onRegenerate={() => handleRegenerateSegment(segment.id)}
              onPreview={() => setPreviewSegment(segment)}
              onDelete={() => handleDeleteSegment(segment.id)}
              disabled={loading}
            />
          ))}
        </div>
      </ScrollArea>

      {/* 最终视频预览 */}
      {longVideo.final_video_url && (
        <Card>
          <CardHeader className="p-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Film className="w-4 h-4" />
              最终视频
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0">
            <video
              src={longVideo.final_video_url}
              controls
              className="w-full rounded"
            />
            <div className="flex items-center gap-2 mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (longVideo.final_video_url) {
                    const a = document.createElement("a");
                    a.href = longVideo.final_video_url;
                    a.download = `长视频_${Date.now()}.mp4`;
                    a.click();
                  }
                }}
              >
                <Download className="w-3 h-3 mr-1" />
                下载
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 分段预览弹窗 */}
      <SegmentPreviewDialog
        segment={previewSegment}
        open={!!previewSegment}
        onClose={() => setPreviewSegment(null)}
      />
    </div>
  );
}
