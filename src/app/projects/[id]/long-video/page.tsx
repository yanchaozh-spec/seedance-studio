"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Plus, X, Play, Pause, RotateCcw, Check, AlertCircle,
  Film, Clock, Settings2, ChevronRight, ChevronLeft, Trash2,
  Volume2, Download, Eye, Image as ImageIcon, Music, PanelRight,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  VideoSegment,
  LongVideo,
  SegmentConfig,
  SegmentPrompt,
  createLongVideoProject,
  generateSegment,
  confirmSegment,
  regenerateSegment,
  getSegments,
  addSegment,
  deleteSegment,
  mergeSegments,
} from "@/lib/long-videos";
import { useSettingsStore } from "@/lib/settings";
import { Asset, getAssets } from "@/lib/assets";
import { toast } from "sonner";
import { useDraggable } from "@/hooks/use-draggable";
import { useDragStore } from "@/lib/drag-store";

// 步进式长视频编辑页面
export default function LongVideoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { arkApiKey } = useSettingsStore();

  // 项目状态
  const [projectId] = useState(resolvedParams.id);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);

  // 长视频项目状态
  const [longVideo, setLongVideo] = useState<LongVideo | null>(null);
  const [segments, setSegments] = useState<VideoSegment[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [previewingSegment, setPreviewingSegment] = useState<VideoSegment | null>(null);

  // 当前段配置
  const [currentPrompts, setCurrentPrompts] = useState<SegmentPrompt[]>([
    { id: "1", content: "", isActivated: true, order: 0 }
  ]);
  const [currentDuration, setCurrentDuration] = useState(5);
  const [currentRatio, setCurrentRatio] = useState("16:9");
  const [currentResolution, setCurrentResolution] = useState("720p");
  const [currentGenerateAudio, setCurrentGenerateAudio] = useState(true);
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);

  // 生成状态
  const [generating, setGenerating] = useState(false);
  const [merging, setMerging] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 加载素材
  useEffect(() => {
    loadAssets();
  }, [projectId]);

  // 加载素材列表
  const loadAssets = async () => {
    try {
      setLoading(true);
      const data = await getAssets(projectId);
      setAssets(data);
    } catch (error) {
      console.error("加载素材失败:", error);
    } finally {
      setLoading(false);
    }
  };

  // 创建新的长视频项目
  const handleCreateProject = async () => {
    try {
      setLoading(true);
      const result = await createLongVideoProject({
        project_id: projectId,
        segments: [{
          prompts: currentPrompts,
          selectedAssets: selectedAssetIds,
          duration: currentDuration,
          ratio: currentRatio,
          resolution: currentResolution,
          generateAudio: currentGenerateAudio,
        }],
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
      setCurrentStep(1);
      toast.success("长视频项目已创建");
    } catch (error) {
      console.error("创建失败:", error);
      toast.error("创建长视频项目失败");
    } finally {
      setLoading(false);
    }
  };

  // 更新当前段配置
  const updateCurrentSegment = async () => {
    if (!longVideo || segments.length === 0) return;

    const currentSegmentId = segments[currentStep - 1]?.id;
    if (!currentSegmentId) return;

    try {
      await fetch(`/api/long-videos/segments/${currentSegmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompts: currentPrompts,
          selectedAssets: selectedAssetIds,
          duration: currentDuration,
          ratio: currentRatio,
          resolution: currentResolution,
          generateAudio: currentGenerateAudio,
        }),
      });

      // 乐观更新本地状态
      setSegments((prev) =>
        prev.map((s) => {
          if (s.id === currentSegmentId) {
            return {
              ...s,
              prompt_content: currentPrompts,
              asset_ids: selectedAssetIds,
              segment_duration: currentDuration,
              segment_ratio: currentRatio,
              segment_resolution: currentResolution,
              segment_generate_audio: currentGenerateAudio,
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

  // 生成当前段
  const handleGenerateCurrentSegment = async () => {
    if (!longVideo || segments.length === 0) return;

    const currentSegmentId = segments[currentStep - 1]?.id;
    if (!currentSegmentId) return;

    try {
      // 先保存当前配置
      await updateCurrentSegment();

      setGenerating(true);
      const result = await generateSegment({ segment_id: currentSegmentId }, arkApiKey);

      // 更新分段状态
      setSegments((prev) =>
        prev.map((s) =>
          s.id === currentSegmentId
            ? { ...s, status: "running", task_id: result.task_id }
            : s
        )
      );

      toast.success("开始生成视频...");

      // 开始轮询
      startPolling(currentSegmentId);
    } catch (error) {
      console.error("生成失败:", error);
      toast.error("生成视频失败");
      setGenerating(false);
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
            setGenerating(false);
          }
        }
      } catch (error) {
        console.error("轮询失败:", error);
      }
    }, 3000);
  };

  // 确认当前段并继续下一段
  const handleConfirmAndContinue = async () => {
    if (!longVideo || segments.length === 0) return;

    const currentSegmentId = segments[currentStep - 1]?.id;
    if (!currentSegmentId) return;

    try {
      setLoading(true);
      const result = await confirmSegment(currentSegmentId);

      setLongVideo(result.long_video);
      setSegments(result.segments);

      // 如果还有下一段，设置下一段的默认配置
      if (result.segments.length > currentStep) {
        const nextSegment = result.segments[currentStep];
        setCurrentPrompts(nextSegment.prompt_content || [{ id: "1", content: "", isActivated: true, order: 0 }]);
        setSelectedAssetIds(nextSegment.asset_ids || []);
        setCurrentDuration(nextSegment.segment_duration || 5);
        setCurrentRatio(nextSegment.segment_ratio || "16:9");
        setCurrentResolution(nextSegment.segment_resolution || "720p");
        setCurrentGenerateAudio(nextSegment.segment_generate_audio ?? true);
      }

      setCurrentStep(currentStep + 1);
      toast.success("已确认，继续下一段");
    } catch (error) {
      console.error("确认失败:", error);
      toast.error("确认分段失败");
    } finally {
      setLoading(false);
    }
  };

  // 添加新段
  const handleAddSegment = async () => {
    if (!longVideo) return;

    try {
      setLoading(true);
      const result = await addSegment(longVideo.id, {
        prompts: [{ id: "1", content: "", isActivated: true, order: 0 }],
        selectedAssets: [],
        duration: 5,
        ratio: currentRatio,
        resolution: currentResolution,
        generateAudio: currentGenerateAudio,
      });

      setSegments(result.segments);
      setCurrentStep(result.segments.length);
      setCurrentPrompts([{ id: "1", content: "", isActivated: true, order: 0 }]);
      setSelectedAssetIds([]);
      setCurrentDuration(5);
      toast.success("已添加新段");
    } catch (error) {
      console.error("添加段失败:", error);
      toast.error("添加新段失败");
    } finally {
      setLoading(false);
    }
  };

  // 删除当前段
  const handleDeleteSegment = async () => {
    if (!longVideo || segments.length === 0) return;

    const currentSegmentId = segments[currentStep - 1]?.id;
    if (!currentSegmentId) return;

    try {
      setLoading(true);
      const result = await deleteSegment(currentSegmentId);

      if (result.long_video_deleted) {
        setLongVideo(null);
        setSegments([]);
        setCurrentStep(0);
        resetForm();
        toast.success("长视频项目已删除");
      } else {
        setSegments(result.segments || []);
        if (currentStep > (result.segments?.length || 0)) {
          setCurrentStep(Math.max(1, result.segments?.length || 1));
        }
        toast.success("段已删除");
      }
    } catch (error) {
      console.error("删除失败:", error);
      toast.error("删除段失败");
    } finally {
      setLoading(false);
    }
  };

  // 重新生成当前段
  const handleRegenerate = async () => {
    if (!longVideo || segments.length === 0) return;

    const currentSegmentId = segments[currentStep - 1]?.id;
    if (!currentSegmentId) return;

    try {
      setGenerating(true);
      const result = await regenerateSegment(currentSegmentId, arkApiKey);

      setSegments((prev) =>
        prev.map((s) =>
          s.id === currentSegmentId
            ? { ...s, status: "running", task_id: result.task_id }
            : s
        )
      );

      toast.success("开始重新生成...");

      // 开始轮询
      startPolling(currentSegmentId);
    } catch (error) {
      console.error("重新生成失败:", error);
      toast.error("重新生成失败");
      setGenerating(false);
    }
  };

  // 合并所有段
  const handleMerge = async () => {
    if (!longVideo) return;

    try {
      setMerging(true);
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
      setMerging(false);
    }
  };

  // 重置表单
  const resetForm = () => {
    setCurrentPrompts([{ id: "1", content: "", isActivated: true, order: 0 }]);
    setSelectedAssetIds([]);
    setCurrentDuration(5);
    setCurrentRatio("16:9");
    setCurrentResolution("720p");
    setCurrentGenerateAudio(true);
  };

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, []);

  // 获取当前段
  const currentSegment = segments[currentStep - 1];
  const currentSegmentStatus = currentSegment?.status || "pending";
  const isGeneratingThisSegment = currentSegmentStatus === "running";
  const isWaitingConfirm = currentSegmentStatus === "waiting_confirm";
  const isFailed = currentSegmentStatus === "failed";
  const canEdit = currentSegmentStatus === "pending" || currentSegmentStatus === "failed";
  const allConfirmed = segments.every((s) => s.status === "confirmed");

  // 计算进度
  const confirmedCount = segments.filter((s) => s.status === "confirmed").length;
  const progress = segments.length > 0 ? Math.round((confirmedCount / segments.length) * 100) : 0;

  // 选中的素材
  const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id));

  // 未选中状态的开始界面
  if (!longVideo) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <Film className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">长视频生成</h1>
          <p className="text-muted-foreground">
            逐段生成视频，每段独立配置，确认后自动衔接
          </p>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">第一段配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 提示词 */}
            <div className="space-y-2">
              <label className="text-sm font-medium">提示词</label>
              {currentPrompts.map((prompt, index) => (
                <div key={prompt.id} className="flex gap-2">
                  <Textarea
                    placeholder="描述视频内容..."
                    value={prompt.content}
                    onChange={(e) => {
                      const updated = [...currentPrompts];
                      updated[index].content = e.target.value;
                      setCurrentPrompts(updated);
                    }}
                    className="min-h-[80px]"
                  />
                  {currentPrompts.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setCurrentPrompts(currentPrompts.filter((_, i) => i !== index));
                      }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentPrompts([
                    ...currentPrompts,
                    { id: Date.now().toString(), content: "", isActivated: true, order: currentPrompts.length }
                  ]);
                }}
              >
                <Plus className="w-4 h-4 mr-1" />
                添加提示词
              </Button>
            </div>

            {/* 参数 */}
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  时长
                </label>
                <Select value={String(currentDuration)} onValueChange={(v) => setCurrentDuration(parseInt(v))}>
                  <SelectTrigger className="h-9">
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
                <Select value={currentRatio} onValueChange={setCurrentRatio}>
                  <SelectTrigger className="h-9">
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
                <Select value={currentResolution} onValueChange={setCurrentResolution}>
                  <SelectTrigger className="h-9">
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
                <Select value={currentGenerateAudio ? "true" : "false"} onValueChange={(v) => setCurrentGenerateAudio(v === "true")}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">生成</SelectItem>
                    <SelectItem value="false">不生成</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Button
          size="lg"
          className="w-full"
          onClick={handleCreateProject}
          disabled={loading || !currentPrompts.some((p) => p.content.trim())}
        >
          <Film className="w-4 h-4 mr-2" />
          开始生成长视频
        </Button>

        <p className="text-xs text-muted-foreground text-center mt-4">
          每段视频生成后可以预览、确认或重新生成
        </p>
      </div>
    );
  }

  // 长视频编辑界面
  return (
    <div className="flex h-full">
      {/* 左侧：步骤列表 */}
      <div className="w-64 border-r bg-card p-4 flex flex-col">
        <h2 className="font-semibold mb-4">视频段落</h2>

        {/* 进度条 */}
        <div className="mb-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">进度</span>
            <span>{confirmedCount}/{segments.length} 段</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* 段列表 */}
        <ScrollArea className="flex-1">
          <div className="space-y-2">
            {segments.map((segment, index) => {
              const statusColors: Record<string, string> = {
                pending: "bg-gray-100 border-gray-300",
                running: "bg-blue-100 border-blue-300 animate-pulse",
                waiting_confirm: "bg-yellow-100 border-yellow-300",
                confirmed: "bg-green-100 border-green-300",
                failed: "bg-red-100 border-red-300",
              };

              return (
                <button
                  key={segment.id}
                  onClick={() => {
                    setCurrentStep(index + 1);
                    // 加载该段的配置
                    setCurrentPrompts(segment.prompt_content || [{ id: "1", content: "", isActivated: true, order: 0 }]);
                    setSelectedAssetIds(segment.asset_ids || []);
                    setCurrentDuration(segment.segment_duration || 5);
                    setCurrentRatio(segment.segment_ratio || "16:9");
                    setCurrentResolution(segment.segment_resolution || "720p");
                    setCurrentGenerateAudio(segment.segment_generate_audio ?? true);
                  }}
                  className={cn(
                    "w-full p-3 rounded-lg border text-left transition-all",
                    currentStep === index + 1 ? "ring-2 ring-primary" : "hover:bg-accent",
                    statusColors[segment.status]
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">第 {index + 1} 段</span>
                    {segment.status === "confirmed" && <Check className="w-4 h-4 text-green-600" />}
                    {segment.status === "waiting_confirm" && <AlertCircle className="w-4 h-4 text-yellow-600" />}
                    {segment.status === "running" && <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />}
                    {segment.status === "failed" && <AlertCircle className="w-4 h-4 text-red-600" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {segment.segment_duration || 5}秒 | {segment.segment_ratio}
                  </p>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        {/* 添加段按钮 */}
        <Button variant="outline" className="mt-4" onClick={handleAddSegment} disabled={loading}>
          <Plus className="w-4 h-4 mr-1" />
          添加段落
        </Button>

        {/* 合并按钮 */}
        {allConfirmed && segments.length > 0 && (
          <Button className="mt-2" onClick={handleMerge} disabled={merging}>
            <Film className="w-4 h-4 mr-1" />
            {merging ? "合并中..." : "合并所有段"}
          </Button>
        )}
      </div>

      {/* 右侧：当前段编辑 */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-2xl mx-auto">
          {/* 步骤指示 */}
          <div className="flex items-center gap-2 mb-6">
            <Badge variant="outline" className="px-3 py-1">
              第 {currentStep} / {segments.length} 段
            </Badge>
            {currentSegment?.first_frame_url && (
              <Badge variant="secondary">
                <ImageIcon className="w-3 h-3 mr-1" />
                已有首帧
              </Badge>
            )}
          </div>

          {/* 首帧预览 */}
          {currentSegment?.first_frame_url && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">上一段尾帧（自动作为本段首帧）</CardTitle>
              </CardHeader>
              <CardContent>
                <img
                  src={currentSegment.first_frame_url}
                  alt="首帧"
                  className="w-48 h-28 object-cover rounded border"
                />
              </CardContent>
            </Card>
          )}

          {/* 视频预览 */}
          {currentSegment?.video_url && (
            <Card className="mb-6">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>视频预览</span>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewingSegment(currentSegment)}>
                    <Eye className="w-4 h-4 mr-1" />
                    全屏
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <video
                  src={currentSegment.video_url}
                  controls
                  className="w-full rounded border"
                />
              </CardContent>
            </Card>
          )}

          {/* 配置区域 */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">段落配置</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 提示词 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">提示词</label>
                {currentPrompts.map((prompt, index) => (
                  <div key={prompt.id} className="flex gap-2">
                    <Textarea
                      placeholder="描述视频内容..."
                      value={prompt.content}
                      onChange={(e) => {
                        const updated = [...currentPrompts];
                        updated[index].content = e.target.value;
                        setCurrentPrompts(updated);
                      }}
                      disabled={!canEdit}
                      className="min-h-[80px]"
                    />
                    {currentPrompts.length > 1 && canEdit && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setCurrentPrompts(currentPrompts.filter((_, i) => i !== index));
                        }}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
                {canEdit && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setCurrentPrompts([
                        ...currentPrompts,
                        { id: Date.now().toString(), content: "", isActivated: true, order: currentPrompts.length }
                      ]);
                    }}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    添加提示词
                  </Button>
                )}
              </div>

              {/* 参数 */}
              <div className="grid grid-cols-4 gap-4">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    时长
                  </label>
                  <Select
                    value={String(currentDuration)}
                    onValueChange={(v) => setCurrentDuration(parseInt(v))}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9">
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
                    value={currentRatio}
                    onValueChange={setCurrentRatio}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9">
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
                    value={currentResolution}
                    onValueChange={setCurrentResolution}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9">
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
                    value={currentGenerateAudio ? "true" : "false"}
                    onValueChange={(v) => setCurrentGenerateAudio(v === "true")}
                    disabled={!canEdit}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">生成</SelectItem>
                      <SelectItem value="false">不生成</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 操作按钮 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {currentStep > 1 && (
                <Button variant="outline" onClick={() => setCurrentStep(currentStep - 1)}>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  上一段
                </Button>
              )}
              {currentStep < segments.length && (
                <Button variant="outline" onClick={() => setCurrentStep(currentStep + 1)}>
                  下一段
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {canEdit && (
                <>
                  <Button variant="outline" onClick={handleDeleteSegment} disabled={loading || segments.length <= 1}>
                    <Trash2 className="w-4 h-4 mr-1" />
                    删除
                  </Button>
                  <Button onClick={handleGenerateCurrentSegment} disabled={generating || !currentPrompts.some((p) => p.content.trim())}>
                    {generating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                        生成中...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1" />
                        生成
                      </>
                    )}
                  </Button>
                </>
              )}

              {isWaitingConfirm && (
                <>
                  <Button variant="outline" onClick={handleRegenerate}>
                    <RotateCcw className="w-4 h-4 mr-1" />
                    重新生成
                  </Button>
                  <Button onClick={handleConfirmAndContinue}>
                    <Check className="w-4 h-4 mr-1" />
                    确认并继续
                  </Button>
                </>
              )}

              {currentSegmentStatus === "confirmed" && (
                <span className="text-sm text-green-600 flex items-center gap-1">
                  <Check className="w-4 h-4" />
                  已确认，尾帧将作为下一段首帧
                </span>
              )}

              {isFailed && (
                <span className="text-sm text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {currentSegment?.error_message || "生成失败"}
                </span>
              )}
            </div>
          </div>

          {/* 最终视频 */}
          {longVideo.final_video_url && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Film className="w-5 h-5" />
                  最终视频
                </CardTitle>
              </CardHeader>
              <CardContent>
                <video
                  src={longVideo.final_video_url}
                  controls
                  className="w-full rounded border"
                />
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    if (longVideo.final_video_url) {
                      const a = document.createElement("a");
                      a.href = longVideo.final_video_url;
                      a.download = `长视频_${Date.now()}.mp4`;
                      a.click();
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-1" />
                  下载视频
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* 视频预览弹窗 */}
      {previewingSegment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setPreviewingSegment(null)}
        >
          <div
            className="bg-background rounded-lg p-4 max-w-4xl w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">第 {segments.findIndex((s) => s.id === previewingSegment.id) + 1} 段预览</h3>
              <Button variant="ghost" size="icon" onClick={() => setPreviewingSegment(null)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            {previewingSegment.video_url && (
              <video
                src={previewingSegment.video_url}
                controls
                autoPlay
                className="w-full rounded"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
