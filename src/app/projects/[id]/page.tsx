"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useDropZone } from "@/hooks/use-draggable";
import { useDragStore, useIsDragging } from "@/lib/drag-store";
import { Plus, X, Image, Play, Trash2, Copy, Scissors, Clock, Check, Music, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Asset } from "@/lib/assets";
import { Task, createTask, getVideoUrl } from "@/lib/tasks";
import { useProjectDetail } from "./layout";
import { useSettingsStore } from "@/lib/settings";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { AssetCard } from "@/components/asset-card";
import { buildSeedanceRequestBody, SeedanceContentItem } from "@/lib/seedance";

// dnd-kit 导入
import {
  DndContext,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  return_last_frame?: boolean;
  tools?: Array<{ type: "web_search" }>;
}

export default function VideoGeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { selectedAssets, setSelectedAssets, materials, setMaterials, addAssetToPool, removeAssetFromPool, clearPool, toggleAssetActivation, refreshTasks } = useProjectDetail();
  const isDragging = useIsDragging();
  const setOverDropZone = useDragStore((state) => state.setOverDropZone);
  const isOverDropZone = useDragStore((state) => state.isOverDropZone);
  const { arkApiKey, modelId } = useSettingsStore();
  const poolDropRef = useRef<HTMLDivElement>(null);
  const [promptBoxes, setPromptBoxes] = useState<PromptBox[]>([
    { id: "1", content: "", isActivated: true },
  ]);
  const [params_, setParams] = useState<GeneratorParams>({
    duration: 5,
    ratio: "16:9",
    resolution: "720p",
    return_last_frame: false,
    tools: [],
  });
  const [generating, setGenerating] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [selectedDetailAsset, setSelectedDetailAsset] = useState<Asset | null>(null);

  // 恢复回滚数据（从 sessionStorage 读取）
  useEffect(() => {
    // 类型定义
    interface RollbackData {
      id?: string;
      prompt_boxes?: Array<{
        id?: string;
        content?: string;
        is_activated?: boolean;
        activated_asset_id?: string;
        keyframe_description?: string;
      }>;
      selected_assets?: string[];
      params?: {
        duration?: number;
        ratio?: string;
        resolution?: string;
        return_last_frame?: boolean;
        tools?: Array<{ type: "web_search" }>;
      };
    }

    // 从 sessionStorage 读取回滚数据
    const rollbackTask = sessionStorage.getItem("rollbackTask");
    if (!rollbackTask) {
      return;
    }

    let rollbackData: RollbackData;
    try {
      rollbackData = JSON.parse(rollbackTask);
    } catch {
      sessionStorage.removeItem("rollbackTask");
      return;
    }

    const task = rollbackData;
    if (!task || !task.prompt_boxes) {
      sessionStorage.removeItem("rollbackTask");
      return;
    }

    // 如果 materials 还没加载好，保留数据等待下一次触发
    if (materials.length === 0) {
      return;
    }

    // materials 已加载，执行恢复
    // 清除 sessionStorage
    sessionStorage.removeItem("rollbackTask");

    // 恢复提示词
    if (task.prompt_boxes.length > 0) {
      setPromptBoxes(task.prompt_boxes.map((box) => ({
        id: box.id || Date.now().toString(),
        content: box.content || "",
        isActivated: box.is_activated ?? true,
        activatedAssetId: box.activated_asset_id,
        keyframeDescription: box.keyframe_description,
      })));
    }

    // 恢复生成参数
    if (task.params) {
      setParams({
        duration: task.params.duration || 5,
        ratio: task.params.ratio || "16:9",
        resolution: task.params.resolution || "720p",
        return_last_frame: task.params.return_last_frame ?? false,
        tools: task.params.tools || [],
      });
    }

    // 恢复选中的素材
    if (task.selected_assets && Array.isArray(task.selected_assets) && task.selected_assets.length > 0) {
      const selectedAssetsToRestore: SelectedAsset[] = [];
      task.selected_assets.forEach((assetId: string) => {
        const asset = materials.find((m) => m.id === assetId);
        if (asset) {
          selectedAssetsToRestore.push({
            ...asset,
            isActivated: true,
          });
        } else {
          console.warn("未找到素材:", assetId);
        }
      });

      if (selectedAssetsToRestore.length > 0) {
        setSelectedAssets(selectedAssetsToRestore);
        console.log("已恢复素材:", selectedAssetsToRestore.length, "个");
      }
    }

    toast.success("已恢复任务数据");
  }, [resolvedParams.id, materials, setSelectedAssets, setPromptBoxes, setParams]);

  // 拖拽排序传感器
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // 拖拽排序结束处理
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setSelectedAssets((items) => {
        const oldIndex = items.findIndex((item) => item.id === active.id);
        const newIndex = items.findIndex((item) => item.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  }, [setSelectedAssets]);

  // 可排序的素材卡片组件 - 保留拖拽手柄
  function SortableAssetCard({ asset }: { asset: SelectedAsset }) {
    const {
      attributes,
      listeners,
      setNodeRef,
      transform,
      transition,
      isDragging,
    } = useSortable({ id: asset.id });

    const style = {
      transform: CSS.Transform.toString(transform),
      transition,
      opacity: isDragging ? 0.5 : 1,
      zIndex: isDragging ? 50 : undefined,
    };

    return (
      <div 
        ref={setNodeRef} 
        style={style} 
        className="relative group"
      >
        {/* 左上角拖拽手柄 */}
        <div className="absolute top-1 left-1 z-20">
          <div
            {...attributes}
            {...listeners}
            className="p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3 h-3 text-muted-foreground" />
          </div>
        </div>
        {/* 右上角删除按钮 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleRemoveAsset(asset.id);
          }}
          className="absolute top-1 right-1 z-20 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
        >
          <X className="w-2.5 h-2.5" />
        </button>
        {/* 中间可点击区域 */}
        <div onClick={() => setSelectedDetailAsset(asset)}>
          <AssetCard
            asset={asset}
            onToggleActivation={() => toggleAssetActivation(asset.id)}
            showRemove={false}
            showActivation={true}
            className={cn(!asset.isActivated && "opacity-50 grayscale")}
          />
        </div>
      </div>
    );
  }
  
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

  // 存储 textarea 引用的 Map
  const textareaRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  // 记录上一次的长度，用于判断是否新增了行
  const prevLengthRef = useRef<number>(1);

  // 监听 promptBoxes 变化，新增行时自动聚焦
  useEffect(() => {
    if (promptBoxes.length > prevLengthRef.current) {
      // 检测到新增行，聚焦最后一行
      const newBox = promptBoxes.at(-1);
      if (newBox) {
        const textarea = textareaRefs.current.get(newBox.id);
        if (textarea) {
          textarea.focus();
        }
      }
    }
    prevLengthRef.current = promptBoxes.length;
  }, [promptBoxes]);

  // 添加 textarea 引用
  const setTextareaRef = (id: string) => (el: HTMLTextAreaElement | null) => {
    if (el) {
      textareaRefs.current.set(id, el);
    } else {
      textareaRefs.current.delete(id);
    }
  };

  // TAB 键跳转到下一行
  const handlePromptKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, currentIndex: number) => {
    if (e.key === "Tab") {
      e.preventDefault();

      const isLastLine = currentIndex === promptBoxes.length - 1;

      if (isLastLine) {
        // 最后一行 → 新增一行
        addPromptBox();
      } else {
        // 不是最后一行 → 聚焦下一行
        const nextId = promptBoxes[currentIndex + 1]?.id;
        if (nextId) {
          const textarea = textareaRefs.current.get(nextId);
          if (textarea) {
            textarea.focus();
          }
        }
      }
    }
  };

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

  // 生成最终提示词预览（显示实际 API 调用格式）
  const generateFinalPrompt = useCallback(() => {
    const nonEmptyBoxes = promptBoxes.filter((box) => box.content.trim());

    // 只使用激活的素材
    const activatedAssets = selectedAssets.filter((a) => a.isActivated);

    // 所有素材（包括 materials 和 selectedAssets）
    const allAssetsList = [...selectedAssets, ...materials.filter(m => !selectedAssets.some(s => s.id === m.id))];
    // 音频素材：从所有素材中找出被激活图片引用的音频
    const audioAssets = allAssetsList.filter((a) => 
      a.type === "audio" && 
      activatedAssets.some(img => img.bound_audio_id === a.id)
    );


    // 构建音频序号映射
    const audioRefMap = new Map<string, string>();
    let audioIndex = 0;
    for (const audio of audioAssets) {
      audioIndex++;
      audioRefMap.set(audio.id, `音频${audioIndex}`);
    }

    // 构建素材定义行（按 activatedAssets 的顺序，不使用图片序号）
    const assetDefParts: string[] = [];
    for (const asset of activatedAssets) {
      const isImage = asset.type === "image" && asset.asset_category !== "keyframe";
      const isKeyframe = asset.type === "keyframe" || asset.asset_category === "keyframe";
      
      if (!isImage && !isKeyframe) continue;
      
      const isKeyframeType = asset.type === "keyframe" || asset.asset_category === "keyframe";
      
      if (isKeyframeType) {
        const desc = (asset as { keyframe_description?: string }).keyframe_description || asset.display_name || asset.name;
        assetDefParts.push(`${desc}`);
      } else {
        const displayName = asset.display_name || asset.name;
        if (asset.bound_audio_id && audioRefMap.has(asset.bound_audio_id)) {
          const audioRef = audioRefMap.get(asset.bound_audio_id)!;
          assetDefParts.push(`${displayName}，声线为：${audioRef}`);
        } else {
          assetDefParts.push(`${displayName}`);
        }
      }
    }

    // 构建文本内容
    const textParts: string[] = [];
    const assetDefLine = assetDefParts.join("；");
    if (assetDefLine) {
      textParts.push(assetDefLine);
    }
    for (const box of nonEmptyBoxes) {
      if (box.content.trim()) {
        textParts.push(box.content.trim());
      }
    }

    const contentItems: SeedanceContentItem[] = [];
    if (textParts.length > 0) {
      contentItems.push({
        type: "text",
        text: textParts.join("\n"),
      });
    }

    // 按 activatedAssets 顺序添加所有图片
    for (const asset of activatedAssets) {
      const isImage = asset.type === "image" && asset.asset_category !== "keyframe";
      const isKeyframe = asset.type === "keyframe" || asset.asset_category === "keyframe";
      if (isImage || isKeyframe) {
        contentItems.push({
          type: "image_url",
          image_url: { url: asset.url },
          role: "reference_image",
        });
      }
    }

    // 添加所有音频（使用 URL）
    for (const audio of audioAssets) {
      contentItems.push({
        type: "audio_url",
        audio_url: { url: audio.url },
        role: "reference_audio",
      });
    }

    // 返回 JSON 格式预览
    const requestBody = buildSeedanceRequestBody(modelId || "", contentItems, {
      ratio: params_.ratio,
      duration: params_.duration,
      resolution: params_.resolution,
      return_last_frame: params_.return_last_frame,
      tools: params_.tools,
    });

    return JSON.stringify(requestBody, null, 2);
  }, [promptBoxes, selectedAssets, params_]);

  // 抽帧功能
  const extractFrame = async (task: Task, time: number = 0) => {
    if (!getVideoUrl(task)) return;

    try {
      toast.loading("正在抽帧...", { id: "extract-frame" });

      // 创建画布来截取视频帧
      const video = document.createElement("video");
      video.crossOrigin = "anonymous";
      video.src = getVideoUrl(task) || "";
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
          asset_category: "keyframe",
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
      
      // 构建提示词：第一行素材引用，后续行提示词内容
      const nonEmptyBoxes = promptBoxes.filter((box) => box.content.trim());
      const promptLines: string[] = [];

      // 找到第一个激活的素材
      const firstBoxWithAsset = nonEmptyBoxes.find((box) => box.isActivated && box.activatedAssetId);
      const firstActivatedAsset = firstBoxWithAsset
        ? selectedAssets.find((a) => a.id === firstBoxWithAsset.activatedAssetId && a.isActivated)
        : selectedAssets.find((a) => (a.type === "image" || a.type === "keyframe") && a.isActivated);

      if (firstActivatedAsset) {
        const displayName = firstActivatedAsset.display_name || firstActivatedAsset.name;
        const isKeyframe = firstActivatedAsset.asset_category === "keyframe";
        
        let assetLine = "";

        if (isKeyframe) {
          // 关键帧：关键帧描述@文件名
          const keyframeDesc = firstBoxWithAsset?.keyframeDescription || firstActivatedAsset.keyframe_description || "";
          if (keyframeDesc) {
            assetLine = `${keyframeDesc}@${displayName}`;
          } else {
            assetLine = `@${displayName}`;
          }
        } else {
          // 美术资产："图片名"@这张图片，声线为@音频文件名
          assetLine = `"${displayName}"@这张图片`;
          if (firstActivatedAsset.bound_audio_id) {
            // 从 selectedAssets 和 materials 中查找绑定的音频
            const allAssets = [...selectedAssets, ...materials.filter(m => !selectedAssets.some(s => s.id === m.id))];
            const boundAudio = allAssets.find((a) => a.id === firstActivatedAsset.bound_audio_id);
            if (boundAudio) {
              const audioName = boundAudio.display_name || boundAudio.name;
              assetLine += `，声线为@${audioName}`;
            }
          }
        }

        // 第一行：素材信息
        promptLines.push(assetLine);

        // 后续行：提示词内容
        nonEmptyBoxes.forEach((box) => {
          promptLines.push(box.content.trim());
        });
      } else {
        // 没有激活素材时，直接输出提示词
        nonEmptyBoxes.forEach((box) => {
          promptLines.push(box.content.trim());
        });
      }

      const finalPrompt = promptLines.join("\n");

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
        model_id: modelId,
      }, arkApiKey);

      toast.success("任务已创建");
      
      // 刷新任务列表
      refreshTasks();
      
      // 保存当前任务数据到 sessionStorage，供回滚使用
      const taskData = {
        prompt_boxes: promptBoxes.map((box) => ({
          id: box.id,
          content: box.content,
          is_activated: box.isActivated,
          activated_asset_id: box.activatedAssetId,
          keyframe_description: box.keyframeDescription,
        })),
        params: {
          duration: params_.duration,
          ratio: params_.ratio,
          resolution: params_.resolution,
        },
      };
      sessionStorage.setItem("lastTask", JSON.stringify(taskData));
      
      // 生成后不清空，用户可继续调整
      // clearPool();
      // setPromptBoxes([{ id: "1", content: "", isActivated: true }]);
    } catch (error) {
      console.error("创建任务失败:", error);
      toast.error("创建任务失败");
    } finally {
      setGenerating(false);
    }
  };

  const handleRemoveAsset = (assetId: string) => {
    removeAssetFromPool(assetId);
  };

  // 筛选关键帧素材
  const keyframeAssets = selectedAssets.filter((a) => a.type === "keyframe");
  const imageAssets = selectedAssets.filter((a) => a.type === "image");

  return (
    <div className="p-4 max-w-4xl mx-auto" suppressHydrationWarning>
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
                  ref={setTextareaRef(box.id)}
                  placeholder={`提示词 ${index + 1}...（按 TAB 跳到下一行）`}
                  value={box.content}
                  onChange={(e) => updatePromptBox(box.id, e.target.value)}
                  onKeyDown={(e) => handlePromptKeyDown(e, index)}
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
            {/* 时长选择 */}
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                时长
              </label>
              <Select
                value={params_.duration.toString()}
                onValueChange={(v) => setParams({ ...params_, duration: parseInt(v) })}
              >
                <SelectTrigger className="w-20 h-7 text-xs" suppressHydrationWarning>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) => (
                    <SelectItem key={d} value={d.toString()}>{d}秒</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground">画幅</label>
              <Select
                value={params_.ratio}
                onValueChange={(v) => setParams({ ...params_, ratio: v })}
              >
                <SelectTrigger className="w-24 h-7 text-xs" suppressHydrationWarning>
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
                <SelectTrigger className="w-20 h-7 text-xs" suppressHydrationWarning>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="480p">480p</SelectItem>
                  <SelectItem value="720p">720p</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="web-search"
                checked={params_.tools?.some(t => t.type === "web_search") ?? false}
                onCheckedChange={(checked) => 
                  setParams({ 
                    ...params_, 
                    tools: checked ? [{ type: "web_search" }] : [] 
                  })
                }
              />
              <label htmlFor="web-search" className="text-xs text-muted-foreground cursor-pointer">
                联网搜索
              </label>
            </div>

            <Button size="sm" onClick={handleGenerate} disabled={generating} className="ml-2">
              <Play className="w-3 h-3 mr-1.5" />
              {generating ? "生成中..." : "开始生成"}
            </Button>
          </div>
        </div>
      </div>

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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCorners}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={selectedAssets.map(a => a.id)}
                strategy={rectSortingStrategy}
              >
                <div className="flex flex-wrap gap-3">
                  {selectedAssets.map((asset) => (
                    <SortableAssetCard
                      key={asset.id}
                      asset={asset}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
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
            <div className="mt-4 space-y-3">
              {/* 图片和关键帧素材 */}
              <div>
                <h3 className="text-sm font-medium mb-2">图片素材:</h3>
                <div className="flex flex-wrap gap-2">
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
                      </div>
                    ))}
                  {selectedAssets.filter((asset) => 
                    (asset.type === "image" || asset.type === "keyframe") && asset.isActivated
                  ).length === 0 && (
                    <span className="text-muted-foreground text-sm">无</span>
                  )}
                </div>
              </div>
              
              {/* 声线素材 */}
              <div>
                <h3 className="text-sm font-medium mb-2">声线素材:</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedAssets
                    .filter((asset) => {
                      // 找出所有绑定到激活图片的音频
                      const isBoundAudio = selectedAssets.some(a => 
                        a.type === "audio" && 
                        a.isActivated &&
                        asset.asset_category !== "keyframe" &&
                        asset.type === "image" &&
                        asset.isActivated &&
                        a.id === asset.bound_audio_id
                      );
                      return isBoundAudio;
                    })
                    .map((asset) => {
                      const boundAudio = selectedAssets.find(a => 
                        a.type === "audio" && a.id === asset.bound_audio_id
                      );
                      return boundAudio ? (
                        <div 
                          key={boundAudio.id} 
                          className="bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded px-2 py-1 text-sm flex items-center gap-1"
                        >
                          <Music className="w-3 h-3" />
                          {boundAudio.display_name || boundAudio.name}
                          <span className="text-muted-foreground text-xs ml-1">
                            → {asset.display_name || asset.name}
                          </span>
                        </div>
                      ) : null;
                    })}
                  {selectedAssets.filter((asset) => {
                    return selectedAssets.some(a => 
                      a.type === "audio" && 
                      a.isActivated &&
                      asset.asset_category !== "keyframe" &&
                      asset.type === "image" &&
                      asset.isActivated &&
                      a.id === asset.bound_audio_id
                    );
                  }).length === 0 && (
                    <span className="text-muted-foreground text-sm">无</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 素材详情对话框 */}
      <AssetDetailDialog
        asset={selectedDetailAsset}
        allAssets={[...selectedAssets, ...materials.filter(m => !selectedAssets.some(s => s.id === m.id))]}
        onClose={() => setSelectedDetailAsset(null)}
        onUpdate={(updatedAsset) => {
          if (updatedAsset) {
            // 更新 selectedAssets
            setSelectedAssets((prev) =>
              prev.map((a) => (a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a))
            );
            // 更新 materials（侧边栏素材库）
            setMaterials((prev) =>
              prev.map((a) => (a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a))
            );
          }
        }}
      />
    </div>
  );
}
