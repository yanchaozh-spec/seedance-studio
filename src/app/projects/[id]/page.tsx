"use client";

import { useState, useCallback } from "react";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDropZone } from "@/hooks/use-draggable";
import { Plus, X, Image, Music, Play, Trash2, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { Asset } from "@/lib/assets";
import { useProjectDetail } from "./layout";
import { createTask } from "@/lib/tasks";
import { toast } from "sonner";

interface PromptBox {
  id: string;
  content: string;
  isActivated: boolean;
  activatedAssetId?: string;
}

interface GeneratorParams {
  duration: number;
  ratio: string;
  resolution: string;
}

export default function VideoGeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { selectedAssets, addAssetToPool, removeAssetFromPool, clearPool } = useProjectDetail();
  const [promptBoxes, setPromptBoxes] = useState<PromptBox[]>([
    { id: "1", content: "", isActivated: true },
  ]);
  const [params_, setParams] = useState<GeneratorParams>({
    duration: 5,
    ratio: "16:9",
    resolution: "1080p",
  });
  const [generating, setGenerating] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);

  // 素材池拖放区域
  const { dropRef: poolDropRef, isOver: isPoolOver, dropZoneProps: poolDropZoneProps } = useDropZone({
    onDrop: (data) => {
      if (data && typeof data === "object" && "type" in data) {
        addAssetToPool(data as Asset);
      }
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

  // 生成最终提示词
  const generateFinalPrompt = useCallback(() => {
    const finalPrompts: string[] = [];

    promptBoxes.forEach((box, index) => {
      if (!box.content.trim()) return;

      let promptText = box.content.trim();

      // 如果激活了素材引用
      if (box.isActivated) {
        const activatedAsset = selectedAssets.find(
          (a) => a.type === "image" && a.id === box.activatedAssetId
        ) || selectedAssets.find((a) => a.type === "image");

        if (activatedAsset) {
          const assetIndex = selectedAssets
            .filter((a) => a.type === "image")
            .findIndex((a) => a.id === activatedAsset.id);
          const displayName = `图${assetIndex + 1}`;
          
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

      finalPrompts.push(`${index + 1}. ${promptText}`);
    });

    return finalPrompts.join("\n");
  }, [promptBoxes, selectedAssets]);

  // 开始生成
  const handleGenerate = async () => {
    try {
      setGenerating(true);
      
      const finalPrompt = promptBoxes
        .filter((box) => box.content.trim())
        .map((box) => {
          let text = box.content.trim();
          if (box.isActivated) {
            const imageAssets = selectedAssets.filter((a) => a.type === "image");
            if (imageAssets.length > 0) {
              const assetIndex = selectedAssets.findIndex((a) => a.type === "image");
              const displayName = selectedAssets[assetIndex]?.display_name || "图1";
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
          order: idx,
        })),
        selected_assets: selectedAssets.map((a) => a.id),
        params: params_,
      });

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

  const handleRemoveAsset = (assetId: string) => {
    removeAssetFromPool(assetId);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">视频生成</h1>
        <p className="text-muted-foreground mt-1">输入提示词，选择素材，生成视频</p>
      </div>

      {/* 提示词区域 */}
      <div className="bg-card border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">提示词</h2>
          <Button variant="outline" size="sm" onClick={() => setPreviewDialogOpen(true)}>
            <Copy className="w-4 h-4 mr-2" />
            预览最终提示词
          </Button>
        </div>
        
        <div className="space-y-3">
          {promptBoxes.map((box, index) => (
            <div key={box.id} className="flex gap-2">
              <Textarea
                placeholder={`提示词 ${index + 1}...`}
                value={box.content}
                onChange={(e) => updatePromptBox(box.id, e.target.value)}
                className="min-h-[60px] resize-none"
              />
              {promptBoxes.length > 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removePromptBox(box.id)}
                  className="flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
        
        <Button variant="outline" className="mt-3" onClick={addPromptBox}>
          <Plus className="w-4 h-4 mr-2" />
          添加提示词
        </Button>
      </div>

      {/* 素材池 */}
      <div className="bg-card border rounded-lg p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">素材池</h2>
          {selectedAssets.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearPool}>
              <Trash2 className="w-4 h-4 mr-2" />
              清空
            </Button>
          )}
        </div>
        
        <div
          ref={poolDropRef}
          {...poolDropZoneProps}
          className={cn(
            "min-h-[100px] border-2 border-dashed rounded-lg p-4 transition-colors",
            isPoolOver ? "border-primary bg-primary/5" : "border-muted-foreground/20"
          )}
        >
          {selectedAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
              <Image className="w-8 h-8 mb-2" />
              <p className="text-sm">从右侧素材库拖拽素材到这里</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {selectedAssets.map((asset, index) => (
                <div
                  key={asset.id}
                  className="relative group bg-muted rounded-lg overflow-hidden"
                >
                  {asset.type === "image" ? (
                    <div className="w-20 h-20">
                      {asset.thumbnail_url ? (
                        <img
                          src={asset.thumbnail_url}
                          alt={asset.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <Image className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      {asset.bound_audio_id && (
                        <div className="absolute top-1 right-1 bg-primary text-primary-foreground text-xs px-1 rounded">
                          <Music className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-20 h-20 flex flex-col items-center justify-center bg-muted">
                      <Music className="w-8 h-8 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                    <span className="text-xs text-white truncate block">
                      {asset.display_name || asset.name}
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveAsset(asset.id)}
                    className="absolute top-1 left-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {/* 添加按钮 */}
              <button
                onClick={() => {/* TODO: 打开素材库抽屉 */}}
                className="w-20 h-20 border-2 border-dashed border-muted-foreground/20 rounded-lg flex flex-col items-center justify-center hover:border-primary/50 transition-colors"
              >
                <Plus className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs text-muted-foreground mt-1">添加</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 参数设置 */}
      <div className="bg-card border rounded-lg p-5 mb-6">
        <h2 className="text-lg font-medium mb-4">生成参数</h2>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">时长</label>
            <Select
              value={params_.duration.toString()}
              onValueChange={(v) => setParams({ ...params_, duration: parseInt(v) })}
            >
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="5">5秒</SelectItem>
                <SelectItem value="10">10秒</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">画幅</label>
            <Select
              value={params_.ratio}
              onValueChange={(v) => setParams({ ...params_, ratio: v })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9 横屏</SelectItem>
                <SelectItem value="9:16">9:16 竖屏</SelectItem>
                <SelectItem value="1:1">1:1 方形</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-2">
            <label className="text-sm text-muted-foreground">分辨率</label>
            <Select
              value={params_.resolution}
              onValueChange={(v) => setParams({ ...params_, resolution: v })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* 生成按钮 */}
      <div className="flex justify-end">
        <Button size="lg" onClick={handleGenerate} disabled={generating}>
          <Play className="w-4 h-4 mr-2" />
          {generating ? "生成中..." : "开始生成"}
        </Button>
      </div>

      {/* 预览提示词对话框 */}
      {previewDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto">
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
                {selectedAssets.map((asset) => (
                  <div key={asset.id} className="bg-muted rounded px-2 py-1 text-sm flex items-center gap-1">
                    {asset.type === "image" ? (
                      <Image className="w-3 h-3" />
                    ) : (
                      <Music className="w-3 h-3" />
                    )}
                    {asset.display_name || asset.name}
                  </div>
                ))}
                {selectedAssets.length === 0 && (
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
