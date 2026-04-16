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
  Download, Eye, Image as ImageIcon, Music, PanelRight,
  Loader2, Scissors, Copy
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
import { AssetCard } from "@/components/asset-card";
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
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  // 当前段配置
  const [currentPrompts, setCurrentPrompts] = useState<SegmentPrompt[]>([
    { id: "1", content: "", isActivated: true, order: 0 }
  ]);
  const [currentDuration, setCurrentDuration] = useState(5);
  const [currentRatio, setCurrentRatio] = useState("16:9");
  const [currentResolution, setCurrentResolution] = useState("720p");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [materialsDrawerOpen, setMaterialsDrawerOpen] = useState(false);

  // 生成状态
  const [generating, setGenerating] = useState(false);
  const [merging, setMerging] = useState(false);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // 选中的素材（带激活状态）
  const selectedAssets = assets.filter((a) => selectedAssetIds.includes(a.id));

  // 切换素材选择状态
  const toggleAssetSelection = (assetId: string) => {
    setSelectedAssetIds((prev) =>
      prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId]
    );
  };

  // 从选中列表移除素材
  const handleRemoveSelectedAsset = (assetId: string) => {
    setSelectedAssetIds((prev) => prev.filter((id) => id !== assetId));
  };

  // 清空选中素材
  const handleClearSelectedAssets = () => {
    setSelectedAssetIds([]);
  };

  // 筛选关键帧和图片素材
  const keyframeAssets = assets.filter((a) => a.type === "keyframe");
  const imageAssets = assets.filter((a) => a.type === "image");
  const selectedKeyframeAssets = selectedAssets.filter((a) => a.type === "keyframe");
  const selectedImageAssets = selectedAssets.filter((a) => a.type === "image");

  // 生成最终提示词（用于预览）
  const generateFinalPrompt = useCallback(() => {
    const lines: string[] = [];
    const nonEmptyPrompts = currentPrompts.filter((p) => p.content.trim());

    // 找到第一个激活的图片或关键帧素材
    const firstActivatedAsset = selectedAssets.find(
      (a) => a.type === "image" || a.type === "keyframe"
    );

    if (firstActivatedAsset) {
      const displayName = firstActivatedAsset.display_name || firstActivatedAsset.name;
      const isKeyframe = firstActivatedAsset.asset_category === "keyframe";

      let assetLine = "";

      if (isKeyframe) {
        // 关键帧：关键帧描述@文件名
        assetLine = `@${displayName}`;
      } else {
        // 美术资产："图片名"@这张图片
        assetLine = `"${displayName}"@这张图片`;
        if (firstActivatedAsset.bound_audio_id) {
          // 从 assets 中查找绑定的音频
          const boundAudio = assets.find((a) => a.id === firstActivatedAsset.bound_audio_id);
          if (boundAudio) {
            const audioName = boundAudio.display_name || boundAudio.name;
            assetLine += `，声线为@${audioName}`;
          }
        }
      }

      // 第一行：素材信息
      lines.push(assetLine);

      // 后续行：提示词内容
      nonEmptyPrompts.forEach((p) => {
        lines.push(p.content.trim());
      });
    } else if (nonEmptyPrompts.length > 0) {
      // 没有激活素材时，直接输出提示词
      nonEmptyPrompts.forEach((p) => {
        lines.push(p.content.trim());
      });
    }

    return lines.join("\n");
  }, [currentPrompts, selectedAssets, assets]);

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
          generateAudio: true,
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
          generateAudio: true,
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
              segment_generate_audio: true,
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
        generateAudio: true,
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">第一段配置</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setPreviewDialogOpen(true)}>
                <Copy className="w-3 h-3 mr-1.5" />
                预览
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 提示词 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">提示词</label>
                <Button variant="ghost" size="sm" onClick={() => setPreviewDialogOpen(true)}>
                  <Copy className="w-3 h-3 mr-1.5" />
                  预览
                </Button>
              </div>
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
            </div>

            {/* 素材选择区域 */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-1">
                  <ImageIcon className="w-4 h-4" />
                  素材选择
                  {selectedAssetIds.length > 0 && (
                    <Badge variant="secondary" className="ml-1">{selectedAssetIds.length}</Badge>
                  )}
                </label>
                <div className="flex items-center gap-2">
                  {selectedAssetIds.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={handleClearSelectedAssets}>
                      <Trash2 className="w-3 h-3 mr-1" />
                      清空
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setMaterialsDrawerOpen(true)}>
                    <PanelRight className="w-3 h-3 mr-1" />
                    选择素材
                  </Button>
                </div>
              </div>

              {/* 已选素材展示 */}
              {selectedAssets.length === 0 ? (
                <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-4 text-center text-muted-foreground text-sm">
                  <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
                  <p>暂无选择素材</p>
                  <p className="text-xs mt-1">点击"选择素材"从素材库中添加</p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedKeyframeAssets.length > 0 && (
                    <div className="w-full">
                      <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
                        <Scissors className="w-3 h-3" />
                        关键帧
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedKeyframeAssets.map((asset) => (
                          <AssetCard
                            key={asset.id}
                            asset={asset}
                            showRemove
                            onRemove={() => handleRemoveSelectedAsset(asset.id)}
                            className="w-24 h-24"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {selectedImageAssets.length > 0 && (
                    <div className="w-full">
                      <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" />
                        图片
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {selectedImageAssets.map((asset) => (
                          <AssetCard
                            key={asset.id}
                            asset={asset}
                            showRemove
                            onRemove={() => handleRemoveSelectedAsset(asset.id)}
                            className="w-24 h-24"
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
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

        {/* 素材选择抽屉 - 开始界面 */}
        <Sheet open={materialsDrawerOpen && !longVideo} onOpenChange={setMaterialsDrawerOpen}>
          <SheetContent className="w-[400px] sm:w-[480px] flex flex-col">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                选择素材
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-auto py-4">
              {keyframeAssets.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <Scissors className="w-4 h-4" />
                    关键帧 ({keyframeAssets.length})
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {keyframeAssets.map((asset) => {
                      const isSelected = selectedAssetIds.includes(asset.id);
                      return (
                        <div
                          key={asset.id}
                          onClick={() => toggleAssetSelection(asset.id)}
                          className={cn(
                            "relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                            isSelected
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-transparent hover:border-muted-foreground/30"
                          )}
                        >
                          <AssetCard asset={asset} className="aspect-square" />
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {imageAssets.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4" />
                    图片 ({imageAssets.length})
                  </h3>
                  <div className="grid grid-cols-3 gap-2">
                    {imageAssets.map((asset) => {
                      const isSelected = selectedAssetIds.includes(asset.id);
                      return (
                        <div
                          key={asset.id}
                          onClick={() => toggleAssetSelection(asset.id)}
                          className={cn(
                            "relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                            isSelected
                              ? "border-primary ring-2 ring-primary/20"
                              : "border-transparent hover:border-muted-foreground/30"
                          )}
                        >
                          <AssetCard asset={asset} className="aspect-square" />
                          {isSelected && (
                            <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                              <Check className="w-3 h-3" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {keyframeAssets.length === 0 && imageAssets.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>暂无素材</p>
                  <p className="text-xs mt-1">请先在素材库中上传素材</p>
                </div>
              )}
            </div>
            <div className="border-t pt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                已选 {selectedAssetIds.length} 个素材
              </p>
              <Button onClick={() => setMaterialsDrawerOpen(false)}>
                确定
              </Button>
            </div>
          </SheetContent>
        </Sheet>

        {/* 预览提示词对话框 - 开始界面 */}
        {previewDialogOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPreviewDialogOpen(false)}>
            <div className="bg-background rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">最终提示词预览</h2>
                <Button variant="ghost" size="sm" onClick={() => setPreviewDialogOpen(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="bg-muted rounded-lg p-4 whitespace-pre-wrap text-sm">
                {generateFinalPrompt() || "(空)"}
              </div>
              <div className="mt-4">
                <h3 className="text-sm font-medium mb-2">使用的素材:</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedAssets
                    .filter((asset) => 
                      (asset.type === "image" || asset.type === "keyframe")
                    )
                    .map((asset) => (
                      <div 
                        key={asset.id} 
                        className="bg-primary/10 text-primary rounded px-2 py-1 text-sm flex items-center gap-1"
                      >
                        {asset.type === "keyframe" ? <Scissors className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                        {asset.display_name || asset.name}
                        {asset.bound_audio_id && <Music className="w-3 h-3 ml-1" />}
                      </div>
                    ))}
                  {selectedAssets.filter((asset) => 
                    (asset.type === "image" || asset.type === "keyframe")
                  ).length === 0 && (
                    <span className="text-muted-foreground text-sm">无</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">段落配置</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setPreviewDialogOpen(true)}>
                  <Copy className="w-3 h-3 mr-1.5" />
                  预览
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 提示词 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">提示词</label>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewDialogOpen(true)}>
                    <Copy className="w-3 h-3 mr-1.5" />
                    预览
                  </Button>
                </div>
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
              </div>

              {/* 素材选择区域 */}
              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <ImageIcon className="w-4 h-4" />
                    素材选择
                    {selectedAssetIds.length > 0 && (
                      <Badge variant="secondary" className="ml-1">{selectedAssetIds.length}</Badge>
                    )}
                  </label>
                  <div className="flex items-center gap-2">
                    {selectedAssetIds.length > 0 && canEdit && (
                      <Button variant="ghost" size="sm" onClick={handleClearSelectedAssets}>
                        <Trash2 className="w-3 h-3 mr-1" />
                        清空
                      </Button>
                    )}
                    {canEdit && (
                      <Button variant="outline" size="sm" onClick={() => setMaterialsDrawerOpen(true)}>
                        <PanelRight className="w-3 h-3 mr-1" />
                        选择素材
                      </Button>
                    )}
                  </div>
                </div>

                {/* 已选素材展示 */}
                {selectedAssets.length === 0 ? (
                  <div className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-4 text-center text-muted-foreground text-sm">
                    <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
                    <p>暂无选择素材</p>
                    <p className="text-xs mt-1">点击"选择素材"从素材库中添加</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedKeyframeAssets.length > 0 && (
                      <div className="w-full">
                        <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
                          <Scissors className="w-3 h-3" />
                          关键帧
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedKeyframeAssets.map((asset) => (
                            <AssetCard
                              key={asset.id}
                              asset={asset}
                              showRemove
                              onRemove={() => handleRemoveSelectedAsset(asset.id)}
                              className="w-24 h-24"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedImageAssets.length > 0 && (
                      <div className="w-full">
                        <p className="text-xs font-medium mb-1.5 flex items-center gap-1">
                          <ImageIcon className="w-3 h-3" />
                          图片
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {selectedImageAssets.map((asset) => (
                            <AssetCard
                              key={asset.id}
                              asset={asset}
                              showRemove
                              onRemove={() => handleRemoveSelectedAsset(asset.id)}
                              className="w-24 h-24"
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
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

      {/* 素材选择抽屉 */}
      <Sheet open={materialsDrawerOpen} onOpenChange={setMaterialsDrawerOpen}>
        <SheetContent className="w-[400px] sm:w-[480px] flex flex-col">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <ImageIcon className="w-5 h-5" />
              选择素材
            </SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto py-4">
            {/* 关键帧素材 */}
            {keyframeAssets.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Scissors className="w-4 h-4" />
                  关键帧 ({keyframeAssets.length})
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {keyframeAssets.map((asset) => {
                    const isSelected = selectedAssetIds.includes(asset.id);
                    return (
                      <div
                        key={asset.id}
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={cn(
                          "relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                          isSelected
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-transparent hover:border-muted-foreground/30"
                        )}
                      >
                        <AssetCard asset={asset} className="aspect-square" />
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 图片素材 */}
            {imageAssets.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4" />
                  图片 ({imageAssets.length})
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {imageAssets.map((asset) => {
                    const isSelected = selectedAssetIds.includes(asset.id);
                    return (
                      <div
                        key={asset.id}
                        onClick={() => toggleAssetSelection(asset.id)}
                        className={cn(
                          "relative cursor-pointer rounded-lg overflow-hidden border-2 transition-all",
                          isSelected
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-transparent hover:border-muted-foreground/30"
                        )}
                      >
                        <AssetCard asset={asset} className="aspect-square" />
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-primary text-primary-foreground rounded-full p-0.5">
                            <Check className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 无素材提示 */}
            {keyframeAssets.length === 0 && imageAssets.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>暂无素材</p>
                <p className="text-xs mt-1">请先在素材库中上传素材</p>
              </div>
            )}
          </div>
          <div className="border-t pt-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              已选 {selectedAssetIds.length} 个素材
            </p>
            <Button onClick={() => setMaterialsDrawerOpen(false)}>
              确定
            </Button>
          </div>
        </SheetContent>
      </Sheet>

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

      {/* 预览提示词对话框 */}
      {previewDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPreviewDialogOpen(false)}>
          <div className="bg-background rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">最终提示词预览</h2>
              <Button variant="ghost" size="sm" onClick={() => setPreviewDialogOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="bg-muted rounded-lg p-4 whitespace-pre-wrap text-sm">
              {generateFinalPrompt() || "(空)"}
            </div>
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">使用的素材:</h3>
              <div className="flex flex-wrap gap-2">
                {selectedAssets
                  .filter((asset) => 
                    (asset.type === "image" || asset.type === "keyframe")
                  )
                  .map((asset) => (
                    <div 
                      key={asset.id} 
                      className="bg-primary/10 text-primary rounded px-2 py-1 text-sm flex items-center gap-1"
                    >
                      {asset.type === "keyframe" ? <Scissors className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                      {asset.display_name || asset.name}
                      {asset.bound_audio_id && <Music className="w-3 h-3 ml-1" />}
                    </div>
                  ))}
                {selectedAssets.filter((asset) => 
                  (asset.type === "image" || asset.type === "keyframe")
                ).length === 0 && (
                  <span className="text-muted-foreground text-sm">无</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
