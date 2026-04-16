"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDropZone } from "@/hooks/use-draggable";
import { useDragStore, useIsDragging } from "@/lib/drag-store";
import { Plus, X, Image, Music, Play, Trash2, Copy, Scissors, Clock, Volume2, Check, Film, StopCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Asset } from "@/lib/assets";
import { Task } from "@/lib/tasks";
import { useProjectDetail } from "./layout";
import { createTask } from "@/lib/tasks";
import { useSettingsStore } from "@/lib/settings";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { createLongVideo, getLongVideo, cancelLongVideo, LongVideo } from "@/lib/long-videos";

// 选中的素材（带激活状态）
export interface SelectedAsset extends Asset {
  isActivated: boolean;
}

interface PromptBox {
  id: string;
  content: string;
  isActivated: boolean;
  activatedAssetId?: string;
  keyframeDescription?: string; // 关键帧描述
}

interface GeneratorParams {
  duration: number;
  ratio: string;
  resolution: string;
}

export default function VideoGeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { selectedAssets, addAssetToPool, removeAssetFromPool, clearPool, toggleAssetActivation } = useProjectDetail();
  const isDragging = useIsDragging();
  const setOverDropZone = useDragStore((state) => state.setOverDropZone);
  const isOverDropZone = useDragStore((state) => state.isOverDropZone);
  const { arkApiKey } = useSettingsStore();
  const poolDropRef = useRef<HTMLDivElement>(null);
  const [promptBoxes, setPromptBoxes] = useState<PromptBox[]>([
    { id: "1", content: "", isActivated: true },
  ]);
  const [params_, setParams] = useState<GeneratorParams>({
    duration: 5,
    ratio: "16:9",
    resolution: "720p",
  });
  const [generating, setGenerating] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedDetailAsset, setSelectedDetailAsset] = useState<Asset | null>(null);
  
  // 长视频相关状态
  const [longVideoMode, setLongVideoMode] = useState(false);
  const [longVideoTargetDuration, setLongVideoTargetDuration] = useState(60);
  const [activeLongVideo, setActiveLongVideo] = useState<LongVideo | null>(null);
  const [longVideoPolling, setLongVideoPolling] = useState(false);
  const longVideoRef = useRef<NodeJS.Timeout | null>(null);
  
  // 素材池拖放区域
  const { dropZoneProps: poolDropZoneProps } = useDropZone({
    onDrop: (data) => {
      // 只有在 drop 时才添加素材
      if (data && typeof data === "object" && "id" in data && "type" in data) {
        addAssetToPool(data as Asset);
      }
    },
    onDragEnter: () => {
      setOverDropZone(true);
    },
    onDragLeave: () => {
      setOverDropZone(false);
    },
  });

  // 添加提示词框
  const addPromptBox = () => {
    setPromptBoxes((prev) => [
      ...prev,
      { id: Date.now().toString(), content: "", isActivated: true },
    ]);
  };

  // 删除提示词框
  const removePromptBox = (id: string) => {
    if (promptBoxes.length <= 1) return;
    setPromptBoxes((prev) => prev.filter((box) => box.id !== id));
  };

  // 更新提示词内容
  const updatePromptBox = (id: string, content: string) => {
    setPromptBoxes((prev) =>
      prev.map((box) => (box.id === id ? { ...box, content } : box))
    );
  };

  // 更新关键帧描述
  const updateKeyframeDescription = (id: string, description: string) => {
    setPromptBoxes((prev) =>
      prev.map((box) => (box.id === id ? { ...box, keyframeDescription: description } : box))
    );
  };

  // 生成最终提示词（包含关键帧描述）
  const generateFinalPrompt = useCallback(() => {
    const finalPrompts: string[] = [];

    // 收集所有提示词框中实际引用的素材
    const referencedAssetIds = new Set<string>();
    const referencedAssets: SelectedAsset[] = [];

    promptBoxes.forEach((box) => {
      if (box.isActivated && box.activatedAssetId) {
        referencedAssetIds.add(box.activatedAssetId);
      }
    });

    // 如果没有显式引用，则使用第一个激活的素材
    if (referencedAssetIds.size === 0) {
      const firstActivated = selectedAssets.find(
        (a) => (a.type === "image" || a.type === "keyframe") && a.isActivated
      );
      if (firstActivated) {
        referencedAssetIds.add(firstActivated.id);
      }
    }

    // 从 selectedAssets 中找出被引用的素材
    referencedAssetIds.forEach((id) => {
      const asset = selectedAssets.find((a) => a.id === id);
      if (asset && (asset.type === "image" || asset.type === "keyframe") && asset.isActivated) {
        referencedAssets.push(asset);
      }
    });

    // 首先添加素材引用行
    if (referencedAssets.length > 0) {
      const assetRefs: string[] = [];
      
      // 图片素材引用，格式：图片名：@图片文件
      referencedAssets.forEach((asset) => {
        const displayName = asset.display_name || asset.name;
        const fileName = asset.name;
        assetRefs.push(`${displayName}：@${fileName}`);
      });
      
      finalPrompts.push(assetRefs.join("|"));
    }

    promptBoxes.forEach((box, index) => {
      if (!box.content.trim()) return;

      let promptText = box.content.trim();

      // 如果激活了素材引用
      if (box.isActivated) {
        const activatedAsset = selectedAssets.find(
          (a) => (a.type === "image" || a.type === "keyframe") && a.id === box.activatedAssetId && a.isActivated
        ) || selectedAssets.find((a) => (a.type === "image" || a.type === "keyframe") && a.isActivated);

        if (activatedAsset) {
          const displayName = activatedAsset.display_name || activatedAsset.name;
          
          // 关键帧特殊处理
          if (activatedAsset.type === "keyframe") {
            const desc = activatedAsset.keyframe_description || box.keyframeDescription || "";
            if (desc) {
              promptText = `视频首帧@"${displayName}"，${desc}，${promptText}`;
            } else {
              promptText = `视频首帧@"${displayName}"，${promptText}`;
            }
          } else {
            let referenceText = `"${displayName}"@这张图片`;
            
            // 如果绑定了音频，添加声线描述
            if (activatedAsset.bound_audio_id) {
              const boundAudio = selectedAssets.find(
                (a) => a.id === activatedAsset.bound_audio_id
              );
              if (boundAudio?.voice_description) {
                referenceText += `，声线为"${boundAudio.voice_description}"`;
              }
            }
            
            promptText = `${referenceText}，${promptText}`;
          }
        }
      }

      finalPrompts.push(promptText);
    });

    return finalPrompts.join("\n");
  }, [promptBoxes, selectedAssets]);

  // 抽帧功能
  const extractFrame = async (task: Task, time: number = 0) => {
    if (!task.result?.video_url) return;

    try {
      toast.loading("正在抽帧...", { id: "extract-frame" });

      // 创建画布来截取视频帧
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = task.result.video_url;
      video.currentTime = time;
      
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => {
          video.play().then(() => {
            setTimeout(() => {
              video.pause();
              resolve();
            }, 100);
          }).catch(reject);
        };
        video.onerror = reject;
      });

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("无法获取画布上下文");
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // 转换为 blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b);
          else reject(new Error("转换失败"));
        }, "image/png");
      });

      // 生成文件名：关键帧_来源任务ID_时间戳.png
      const fileName = `关键帧_${task.id}_${Date.now()}.png`;

      // 上传到服务器
      const formData = new FormData();
      formData.append("file", blob, fileName);
      formData.append("projectId", resolvedParams.id);
      formData.append("type", "keyframe");

      const response = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("上传失败");

      const asset = await response.json();
      
      // 更新为关键帧类型
      await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_keyframe: true,
          keyframe_source_task_id: task.id,
          keyframe_description: "",
          display_name: `关键帧 ${formatDistanceToNow(new Date(), { addSuffix: false })}`,
        }),
      });

      toast.success("抽帧成功，已添加到素材库", { id: "extract-frame" });
    } catch (error) {
      console.error("抽帧失败:", error);
      toast.error("抽帧失败", { id: "extract-frame" });
    }
  };

  // 开始生成
  const handleGenerate = async () => {
    try {
      setGenerating(true);
      
      const finalPrompt = promptBoxes
        .filter((box) => box.content.trim())
        .map((box) => {
          let text = box.content.trim();
          if (box.isActivated) {
            const imageAssets = selectedAssets.filter((a) => a.type === "image" || a.type === "keyframe");
            if (imageAssets.length > 0) {
              const activatedAsset = imageAssets.find((a) => a.id === box.activatedAssetId) || imageAssets[0];
              const displayName = activatedAsset.display_name || activatedAsset.name;
              
              // 关键帧特殊处理
              if (activatedAsset.type === "keyframe") {
                const desc = activatedAsset.keyframe_description || box.keyframeDescription || "";
                if (desc) {
                  text = `视频首帧@"${displayName}"，${desc}，${text}`;
                } else {
                  text = `视频首帧@"${displayName}"，${text}`;
                }
              } else {
                let ref = `"${displayName}"@这张图片`;
                
                const img = imageAssets[0];
                if (img.bound_audio_id) {
                  const audio = selectedAssets.find((a) => a.id === img.bound_audio_id);
                  if (audio?.voice_description) {
                    ref += `，声线为"${audio.voice_description}"`;
                  }
                }
                text = `${ref}，${text}`;
              }
            }
          }
          return text;
        })
        .join("\n");

      if (!finalPrompt.trim()) {
        toast.error("请输入提示词");
        return;
      }

      await createTask({
        project_id: resolvedParams.id,
        prompt_boxes: promptBoxes.map((box, idx) => ({
          id: box.id,
          content: box.content,
          is_activated: box.isActivated,
          activated_asset_id: box.activatedAssetId,
          keyframe_description: box.keyframeDescription,
          order: idx,
        })),
        selected_assets: selectedAssets.map((a) => a.id),
        params: params_,
      }, arkApiKey);

      toast.success("任务已创建");
      clearPool();
      setPromptBoxes([{ id: "1", content: "", isActivated: true }]);
    } catch (error) {
      console.error("创建任务失败:", error);
      toast.error("创建任务失败");
    } finally {
      setGenerating(false);
    }
  };

  // 生成最终提示词（用于长视频）
  const buildFinalPrompt = useCallback(() => {
    const finalPrompts: string[] = [];

    promptBoxes.forEach((box, index) => {
      if (!box.content.trim()) return;

      let promptText = box.content.trim();

      if (box.isActivated) {
        const activatedAsset = selectedAssets.find(
          (a) => (a.type === "image" || a.type === "keyframe") && a.id === box.activatedAssetId && a.isActivated
        ) || selectedAssets.find((a) => (a.type === "image" || a.type === "keyframe") && a.isActivated);

        if (activatedAsset) {
          const displayName = activatedAsset.display_name || activatedAsset.name;

          if (activatedAsset.type === "keyframe") {
            const desc = activatedAsset.keyframe_description || box.keyframeDescription || "";
            if (desc) {
              promptText = `视频首帧@"${displayName}"，${desc}，${promptText}`;
            } else {
              promptText = `视频首帧@"${displayName}"，${promptText}`;
            }
          } else {
            let referenceText = `"${displayName}"@这张图片`;

            if (activatedAsset.bound_audio_id) {
              const boundAudio = selectedAssets.find(
                (a) => a.id === activatedAsset.bound_audio_id
              );
              if (boundAudio?.voice_description) {
                referenceText += `，声线为"${boundAudio.voice_description}"`;
              }
            }

            promptText = `${referenceText}，${promptText}`;
          }
        }
      }

      finalPrompts.push(promptText);
    });

    return finalPrompts.join("\n");
  }, [promptBoxes, selectedAssets]);

  // 生成60秒长视频
  const handleGenerateLongVideo = async () => {
    try {
      setGenerating(true);

      const finalPrompt = buildFinalPrompt();

      if (!finalPrompt.trim()) {
        toast.error("请输入提示词");
        return;
      }

      const result = await createLongVideo({
        project_id: resolvedParams.id,
        prompts: promptBoxes.map((box, idx) => ({
          id: box.id,
          content: box.content,
          is_activated: box.isActivated,
          activated_asset_id: box.activatedAssetId,
          keyframe_description: box.keyframeDescription,
          order: idx,
        })),
        selected_assets: selectedAssets.map((a) => a.id),
        params: {
          target_duration: longVideoTargetDuration,
          ratio: params_.ratio,
          resolution: params_.resolution,
          generate_audio: true,
        },
      }, arkApiKey);

      toast.success("长视频任务已创建");

      // 开始轮询状态
      setActiveLongVideo({
        id: result.id,
        project_id: resolvedParams.id,
        status: "pending",
        progress: 0,
        total_segments: result.total_segments,
        completed_segments: 0,
        target_duration: result.target_duration,
        prompts: [],
        selected_assets: [],
        params: { ratio: params_.ratio, resolution: params_.resolution, generate_audio: true },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      setLongVideoPolling(true);

      // 开始轮询
      longVideoRef.current = setInterval(async () => {
        try {
          const video = await getLongVideo(result.id);
          if (video) {
            setActiveLongVideo(video);

            if (video.status === "succeeded") {
              toast.success("长视频生成完成！");
              setLongVideoPolling(false);
              if (longVideoRef.current) {
                clearInterval(longVideoRef.current);
                longVideoRef.current = null;
              }
            } else if (video.status === "failed") {
              toast.error(`长视频生成失败: ${video.error_message}`);
              setLongVideoPolling(false);
              if (longVideoRef.current) {
                clearInterval(longVideoRef.current);
                longVideoRef.current = null;
              }
            }
          }
        } catch (error) {
          console.error("轮询长视频状态失败:", error);
        }
      }, 3000);

    } catch (error) {
      console.error("创建长视频失败:", error);
      toast.error("创建长视频失败");
    } finally {
      setGenerating(false);
    }
  };

  // 取消长视频生成
  const handleCancelLongVideo = async () => {
    if (!activeLongVideo) return;

    try {
      await cancelLongVideo(activeLongVideo.id);
      toast.success("长视频任务已取消");

      setLongVideoPolling(false);
      if (longVideoRef.current) {
        clearInterval(longVideoRef.current);
        longVideoRef.current = null;
      }
      setActiveLongVideo(null);
    } catch (error) {
      console.error("取消长视频失败:", error);
      toast.error("取消长视频失败");
    }
  };

  // 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (longVideoRef.current) {
        clearInterval(longVideoRef.current);
      }
    };
  }, []);

  const handleRemoveAsset = (assetId: string) => {
    removeAssetFromPool(assetId);
  };

  // 筛选关键帧素材
  const keyframeAssets = selectedAssets.filter((a) => a.type === "keyframe");
  const imageAssets = selectedAssets.filter((a) => a.type === "image");
  const audioAssets = selectedAssets.filter((a) => a.type === "audio");

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-4">
        <h1 className="text-xl font-semibold">视频生成</h1>
        <p className="text-muted-foreground text-sm mt-0.5">输入提示词，选择素材，生成视频</p>
      </div>

      {/* 提示词区域 */}
      <div className="bg-card border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium">提示词</h2>
          <Button variant="outline" size="sm" onClick={() => setPreviewDialogOpen(true)}>
            <Copy className="w-3 h-3 mr-1.5" />
            预览
          </Button>
        </div>
        
        <div className="space-y-2">
          {promptBoxes.map((box, index) => (
            <div key={box.id} className="space-y-1.5">
              <div className="flex gap-2">
                <Textarea
                  placeholder={`提示词 ${index + 1}...`}
                  value={box.content}
                  onChange={(e) => updatePromptBox(box.id, e.target.value)}
                  className="min-h-[48px] resize-none text-sm"
                />
                {promptBoxes.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removePromptBox(box.id)}
                    className="flex-shrink-0 h-8 w-8"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
              {/* 关键帧描述输入框 */}
              {keyframeAssets.length > 0 && (
                <Input
                  placeholder="输入关键帧描述"
                  value={box.keyframeDescription || ""}
                  onChange={(e) => updateKeyframeDescription(box.id, e.target.value)}
                  className="text-xs h-7"
                />
              )}
            </div>
          ))}
        </div>
        
        <Button variant="outline" size="sm" className="mt-2" onClick={addPromptBox}>
          <Plus className="w-3 h-3 mr-1.5" />
          添加提示词
        </Button>
      </div>

      {/* 参数设置 + 生成按钮 */}
      <div className="bg-card border rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium">生成参数</h2>
          <div className="flex items-center gap-4">
            {/* 长视频模式切换 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Film className="w-3 h-3" />
                长视频
              </label>
              <Select
                value={longVideoMode ? "long" : "short"}
                onValueChange={(v) => setLongVideoMode(v === "long")}
              >
                <SelectTrigger className="w-20 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">普通</SelectItem>
                  <SelectItem value="long">长视频</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 时长选择 */}
            {longVideoMode ? (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  时长
                </label>
                <Select
                  value={longVideoTargetDuration.toString()}
                  onValueChange={(v) => setLongVideoTargetDuration(parseInt(v))}
                >
                  <SelectTrigger className="w-20 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[15, 30, 45, 60].map((d) => (
                      <SelectItem key={d} value={d.toString()}>{d}秒</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  时长
                </label>
                <Select
                  value={params_.duration.toString()}
                  onValueChange={(v) => setParams({ ...params_, duration: parseInt(v) })}
                >
                  <SelectTrigger className="w-20 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) => (
                      <SelectItem key={d} value={d.toString()}>{d}秒</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">画幅</label>
              <Select
                value={params_.ratio}
                onValueChange={(v) => setParams({ ...params_, ratio: v })}
              >
                <SelectTrigger className="w-24 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="16:9">16:9</SelectItem>
                  <SelectItem value="9:16">9:16</SelectItem>
                  <SelectItem value="adaptive">自适应</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">分辨率</label>
              <Select
                value={params_.resolution}
                onValueChange={(v) => setParams({ ...params_, resolution: v })}
              >
                <SelectTrigger className="w-20 h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {longVideoMode ? (
              <>
                <Button
                  size="sm"
                  onClick={handleGenerateLongVideo}
                  disabled={generating || longVideoPolling}
                  className="ml-2"
                  variant="default"
                >
                  <Film className="w-3 h-3 mr-1.5" />
                  {generating ? "创建中..." : "生成60秒"}
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleGenerate} disabled={generating} className="ml-2">
                <Play className="w-3 h-3 mr-1.5" />
                {generating ? "生成中..." : "开始生成"}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* 长视频生成状态 */}
      {activeLongVideo && (
        <div className="bg-card border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Film className="w-4 h-4 text-primary" />
              <h2 className="text-base font-medium">长视频生成中</h2>
              <span className="text-xs text-muted-foreground">
                ({activeLongVideo.completed_segments}/{activeLongVideo.total_segments} 段)
              </span>
            </div>
            {longVideoPolling && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelLongVideo}
              >
                <StopCircle className="w-3 h-3 mr-1.5" />
                取消
              </Button>
            )}
          </div>

          {/* 进度条 */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">
                {activeLongVideo.status === "pending" && "等待开始..."}
                {activeLongVideo.status === "generating" && "正在生成视频段..."}
                {activeLongVideo.status === "merging" && "正在拼接视频..."}
                {activeLongVideo.status === "succeeded" && "生成完成！"}
                {activeLongVideo.status === "failed" && `失败: ${activeLongVideo.error_message}`}
              </span>
              <span className="font-medium">{activeLongVideo.progress}%</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  activeLongVideo.status === "failed" ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${activeLongVideo.progress}%` }}
              />
            </div>
          </div>

          {/* 分段进度 */}
          <div className="grid grid-cols-4 gap-2">
            {activeLongVideo.segments?.map((segment) => (
              <div
                key={segment.id}
                className={cn(
                  "text-xs p-2 rounded border text-center",
                  segment.status === "succeeded" && "bg-green-100 border-green-300 text-green-700",
                  segment.status === "running" && "bg-blue-100 border-blue-300 text-blue-700 animate-pulse",
                  segment.status === "queued" && "bg-yellow-100 border-yellow-300 text-yellow-700",
                  segment.status === "pending" && "bg-gray-100 border-gray-300 text-gray-500",
                  segment.status === "failed" && "bg-red-100 border-red-300 text-red-700"
                )}
              >
                段 {segment.segment_index + 1}
                <br />
                <span className="text-[10px]">
                  {segment.status === "succeeded" && "完成"}
                  {segment.status === "running" && "生成中"}
                  {segment.status === "queued" && "排队"}
                  {segment.status === "pending" && "等待"}
                  {segment.status === "failed" && "失败"}
                </span>
              </div>
            ))}
          </div>

          {/* 最终视频预览 */}
          {activeLongVideo.status === "succeeded" && activeLongVideo.final_video_url && (
            <div className="mt-4 pt-4 border-t">
              <h3 className="text-sm font-medium mb-2">最终视频</h3>
              <video
                src={activeLongVideo.final_video_url}
                controls
                className="w-full max-w-md rounded-lg"
              />
              <div className="mt-2 text-xs text-muted-foreground">
                时长: {activeLongVideo.final_video_duration}秒
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => {
                  if (activeLongVideo?.final_video_url) {
                    const a = document.createElement("a");
                    a.href = activeLongVideo.final_video_url;
                    a.download = `long-video-${Date.now()}.mp4`;
                    a.click();
                  }
                }}
              >
                下载视频
              </Button>
            </div>
          )}
        </div>
      )}

      {/* 素材池 */}
      <div className={cn(
        "bg-card border rounded-lg p-4 transition-all duration-200",
        isDragging && "ring-2 ring-primary ring-offset-2 ring-offset-background"
      )}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-medium flex items-center gap-2">
            素材池
            {isOverDropZone && (
              <span className="text-xs text-primary animate-pulse">释放添加</span>
            )}
          </h2>
          {selectedAssets.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearPool}>
              <Trash2 className="w-3 h-3 mr-1" />
              清空
            </Button>
          )}
        </div>
        
        <div
          ref={poolDropRef}
          {...poolDropZoneProps}
          className={cn(
            "min-h-[80px] border-2 border-dashed rounded-lg p-3 transition-colors",
            isOverDropZone ? "border-primary bg-primary/10" : "border-muted-foreground/20"
          )}
        >
          {selectedAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-4 text-muted-foreground">
              <Image className="w-6 h-6 mb-1" />
              <p className="text-xs">从右侧素材库拖拽素材到这里</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* 关键帧 */}
              {keyframeAssets.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Scissors className="w-3 h-3" />
                    {keyframeAssets.map((asset, idx) => (
                      <span key={asset.id}>
                        {asset.display_name || asset.name}
                        {idx < keyframeAssets.length - 1 && "、"}
                      </span>
                    ))}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {keyframeAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className={cn(
                          "relative group bg-muted rounded-lg overflow-hidden w-20 cursor-pointer hover:ring-2 hover:ring-primary transition-all",
                          !asset.isActivated && "opacity-50 grayscale"
                        )}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          setSelectedDetailAsset(asset);
                        }}
                      >
                        <div className="aspect-video relative">
                          {asset.thumbnail_url || asset.url ? (
                            <img
                              src={asset.thumbnail_url || asset.url}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Scissors className="w-6 h-6 text-primary" />
                            </div>
                          )}
                          {asset.bound_audio_id && (
                            <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1 rounded flex items-center gap-0.5">
                              <Music className="w-2.5 h-2.5" />
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAsset(asset.id);
                            }}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <div className="p-1 space-y-0.5">
                          {/* 声音状态 */}
                          <div className={cn(
                            "flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px]",
                            asset.bound_audio_id 
                              ? "bg-primary/20 text-primary" 
                              : "bg-muted-foreground/10 text-muted-foreground"
                          )}>
                            <Music className="w-2.5 h-2.5" />
                            <span>{asset.bound_audio_id ? "有" : "无"}声</span>
                          </div>
                          {/* 激活按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAssetActivation(asset.id);
                            }}
                            className={cn(
                              "w-full flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px] transition-all",
                              asset.isActivated 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30"
                            )}
                          >
                            <span>激活</span>
                            {asset.isActivated && <Check className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 图片 */}
              {imageAssets.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Image className="w-3 h-3" />
                    {imageAssets.map((asset, idx) => (
                      <span key={asset.id}>
                        {asset.display_name || asset.name}
                        {idx < imageAssets.length - 1 && "、"}
                      </span>
                    ))}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {imageAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className={cn(
                          "relative group bg-muted rounded-lg overflow-hidden w-20 cursor-pointer hover:ring-2 hover:ring-primary transition-all",
                          !asset.isActivated && "opacity-50 grayscale"
                        )}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('button')) return;
                          setSelectedDetailAsset(asset);
                        }}
                      >
                        <div className="aspect-video relative">
                          {asset.thumbnail_url ? (
                            <img
                              src={asset.thumbnail_url}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Image className="w-6 h-6 text-muted-foreground" />
                            </div>
                          )}
                          {asset.bound_audio_id && (
                            <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[10px] px-1 rounded flex items-center gap-0.5">
                              <Music className="w-2.5 h-2.5" />
                            </div>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveAsset(asset.id);
                            }}
                            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-2.5 h-2.5" />
                          </button>
                        </div>
                        <div className="p-1 space-y-0.5">
                          {/* 声音状态 */}
                          <div className={cn(
                            "flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px]",
                            asset.bound_audio_id 
                              ? "bg-primary/20 text-primary" 
                              : "bg-muted-foreground/10 text-muted-foreground"
                          )}>
                            <Music className="w-2.5 h-2.5" />
                            <span>{asset.bound_audio_id ? "有" : "无"}声</span>
                          </div>
                          {/* 激活按钮 */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleAssetActivation(asset.id);
                            }}
                            className={cn(
                              "w-full flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px] transition-all",
                              asset.isActivated 
                                ? "bg-primary text-primary-foreground" 
                                : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30"
                            )}
                          >
                            <span>激活</span>
                            {asset.isActivated && <Check className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 音频 */}
              {audioAssets.length > 0 && (
                <div>
                  <h3 className="text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Music className="w-3 h-3" />
                    音频 ({audioAssets.length})
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {audioAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="relative group bg-muted rounded-lg overflow-hidden w-16 h-16 flex items-center justify-center"
                      >
                        <Music className="w-6 h-6 text-muted-foreground" />
                        <button
                          onClick={() => handleRemoveAsset(asset.id)}
                          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

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
                {/* 只显示激活的图片和关键帧 */}
                {selectedAssets
                  .filter((asset) => 
                    (asset.type === "image" || asset.type === "keyframe") && 
                    asset.isActivated
                  )
                  .map((asset) => (
                    <div 
                      key={asset.id} 
                      className="bg-primary/10 text-primary rounded px-2 py-1 text-sm flex items-center gap-1"
                    >
                      {asset.type === "keyframe" ? <Scissors className="w-3 h-3" /> : <Image className="w-3 h-3" />}
                      {asset.display_name || asset.name}
                      {asset.bound_audio_id && <Music className="w-3 h-3 ml-1" />}
                    </div>
                  ))}
                {/* 显示绑定的音频 */}
                {selectedAssets
                  .filter((asset) => asset.type === "audio")
                  .map((asset) => (
                    <div 
                      key={asset.id} 
                      className="bg-primary/10 text-primary rounded px-2 py-1 text-sm flex items-center gap-1"
                    >
                      <Music className="w-3 h-3" />
                      {asset.display_name || asset.name}
                    </div>
                  ))}
                {selectedAssets.filter((asset) => 
                  (asset.type === "image" || asset.type === "keyframe") && asset.isActivated
                ).length === 0 && selectedAssets.filter((asset) => asset.type === "audio").length === 0 && (
                  <span className="text-muted-foreground text-sm">无</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 素材详情对话框 */}
      <AssetDetailDialog
        asset={selectedDetailAsset}
        allAssets={selectedAssets}
        onClose={() => setSelectedDetailAsset(null)}
        onUpdate={() => {
          // 刷新素材池数据 - 由于使用的是本地状态，需要手动触发更新
          // 这里可以添加额外的刷新逻辑
        }}
      />
    </div>
  );
}
