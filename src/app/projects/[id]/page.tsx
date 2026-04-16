"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { use } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDropZone } from "@/hooks/use-draggable";
import { Plus, X, Image, Music, Play, Trash2, Copy, Film, Scissors, Clock, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Asset } from "@/lib/assets";
import { Task, getTasks, TaskStatus } from "@/lib/tasks";
import { useProjectDetail } from "./layout";
import { createTask } from "@/lib/tasks";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

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

const statusConfig: Record<TaskStatus, { label: string; color: string }> = {
  queued: { label: "排队中", color: "text-muted-foreground" },
  running: { label: "生成中", color: "text-blue-500" },
  succeeded: { label: "已完成", color: "text-green-500" },
  failed: { label: "失败", color: "text-red-500" },
};

export default function VideoGeneratePage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const { selectedAssets, addAssetToPool, removeAssetFromPool, clearPool } = useProjectDetail();
  const [promptBoxes, setPromptBoxes] = useState<PromptBox[]>([
    { id: "1", content: "", isActivated: true },
  ]);
  const [params_, setParams] = useState<GeneratorParams>({
    duration: 5,
    ratio: "16:9",
    resolution: "10800p",
  });
  const [generating, setGenerating] = useState(false);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [tasksDrawerOpen, setTasksDrawerOpen] = useState(false);
  const [materialsDrawerOpen, setMaterialsDrawerOpen] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // 加载任务列表
  const loadTasks = async () => {
    try {
      setLoadingTasks(true);
      const data = await getTasks(resolvedParams.id);
      setTasks(data);
    } catch (error) {
      console.error("加载任务失败:", error);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (tasksDrawerOpen) {
      loadTasks();
    }
  }, [tasksDrawerOpen, resolvedParams.id]);

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

  // 更新关键帧描述
  const updateKeyframeDescription = (id: string, description: string) => {
    setPromptBoxes((prev) =>
      prev.map((box) => (box.id === id ? { ...box, keyframeDescription: description } : box))
    );
  };

  // 生成最终提示词（包含关键帧描述）
  const generateFinalPrompt = useCallback(() => {
    const finalPrompts: string[] = [];

    promptBoxes.forEach((box, index) => {
      if (!box.content.trim()) return;

      let promptText = box.content.trim();

      // 如果激活了素材引用
      if (box.isActivated) {
        const activatedAsset = selectedAssets.find(
          (a) => (a.type === "image" || a.type === "keyframe") && a.id === box.activatedAssetId
        ) || selectedAssets.find((a) => a.type === "image" || a.type === "keyframe");

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

      finalPrompts.push(`${index + 1}. ${promptText}`);
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
      
      // 关闭抽屉并刷新
      setTasksDrawerOpen(false);
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

  // 筛选关键帧素材
  const keyframeAssets = selectedAssets.filter((a) => a.type === "keyframe");
  const imageAssets = selectedAssets.filter((a) => a.type === "image");
  const audioAssets = selectedAssets.filter((a) => a.type === "audio");

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">视频生成</h1>
          <p className="text-muted-foreground mt-1">输入提示词，选择素材，生成视频</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setMaterialsDrawerOpen(true)}>
            <Image className="w-4 h-4 mr-2" />
            素材库
          </Button>
          <Button variant="outline" onClick={() => setTasksDrawerOpen(true)}>
            <Film className="w-4 h-4 mr-2" />
            任务管理
          </Button>
        </div>
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
            <div key={box.id} className="space-y-2">
              <div className="flex gap-2">
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
              {/* 关键帧描述输入框 */}
              {keyframeAssets.length > 0 && (
                <Input
                  placeholder="输入关键帧描述（如：视频首帧），将整合到提示词中"
                  value={box.keyframeDescription || ""}
                  onChange={(e) => updateKeyframeDescription(box.id, e.target.value)}
                  className="text-sm"
                />
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
            <div className="space-y-4">
              {/* 关键帧 */}
              {keyframeAssets.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Scissors className="w-4 h-4" />
                    关键帧 ({keyframeAssets.length})
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {keyframeAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="relative group bg-muted rounded-lg overflow-hidden border-2 border-primary/30"
                      >
                        <div className="w-20 h-20">
                          {asset.thumbnail_url || asset.url ? (
                            <img
                              src={asset.thumbnail_url || asset.url}
                              alt={asset.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Scissors className="w-8 h-8 text-primary" />
                            </div>
                          )}
                        </div>
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
                  </div>
                </div>
              )}

              {/* 图片 */}
              {imageAssets.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Image className="w-4 h-4" />
                    图片 ({imageAssets.length})
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {imageAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="relative group bg-muted rounded-lg overflow-hidden"
                      >
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
                  </div>
                </div>
              )}

              {/* 音频 */}
              {audioAssets.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <Music className="w-4 h-4" />
                    音频 ({audioAssets.length})
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {audioAssets.map((asset) => (
                      <div
                        key={asset.id}
                        className="relative group bg-muted rounded-lg overflow-hidden"
                      >
                        <div className="w-20 h-20 flex flex-col items-center justify-center">
                          <Music className="w-8 h-8 text-muted-foreground" />
                        </div>
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
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 参数设置 */}
      <div className="bg-card border rounded-lg p-5 mb-6">
        <h2 className="text-lg font-medium mb-4">生成参数</h2>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="w-4 h-4" />
              时长
            </label>
            <Select
              value={params_.duration.toString()}
              onValueChange={(v) => setParams({ ...params_, duration: parseInt(v) })}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((d) => (
                  <SelectItem key={d} value={d.toString()}>{d}秒</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">画幅</label>
            <Select
              value={params_.ratio}
              onValueChange={(v) => setParams({ ...params_, ratio: v })}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="16:9">16:9 横屏</SelectItem>
                <SelectItem value="9:16">9:16 竖屏</SelectItem>
                <SelectItem value="21:9">21:9 电影</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-center gap-3">
            <label className="text-sm text-muted-foreground">分辨率</label>
            <Select
              value={params_.resolution}
              onValueChange={(v) => setParams({ ...params_, resolution: v })}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="720p">720p</SelectItem>
                <SelectItem value="1080p">1080p</SelectItem>
                <SelectItem value="1080p_16_9_fhd">1080p FHD</SelectItem>
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
                {selectedAssets.map((asset) => (
                  <div key={asset.id} className="bg-muted rounded px-2 py-1 text-sm flex items-center gap-1">
                    {asset.type === "keyframe" ? <Scissors className="w-3 h-3" /> : 
                     asset.type === "image" ? <Image className="w-3 h-3" /> : 
                     <Music className="w-3 h-3" />}
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

      {/* 任务管理抽屉 */}
      <Sheet open={tasksDrawerOpen} onOpenChange={setTasksDrawerOpen}>
        <SheetContent className="w-80 sm:max-w-[400px] p-0" side="right">
          <SheetHeader className="p-4 border-b">
            <SheetTitle>任务管理</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-auto p-4">
            {loadingTasks ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : tasks.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Film className="w-12 h-12 mx-auto mb-3" />
                <p>暂无任务</p>
                <p className="text-sm">开始生成视频后将显示在这里</p>
              </div>
            ) : (
              <div className="space-y-3">
                {tasks.map((task) => (
                  <div key={task.id} className="bg-muted rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-muted-foreground font-mono">
                        {task.id.slice(0, 8)}...
                      </span>
                      <span className={cn("text-xs font-medium", statusConfig[task.status]?.color)}>
                        {statusConfig[task.status]?.label}
                      </span>
                    </div>
                    {task.result?.video_url && task.status === "succeeded" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full gap-2"
                        onClick={() => extractFrame(task, 0)}
                      >
                        <Scissors className="w-4 h-4" />
                        抽帧到素材库
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDistanceToNow(new Date(task.created_at), { addSuffix: true })}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* 素材库抽屉触发按钮 */}
      <button
        onClick={() => setMaterialsDrawerOpen(!materialsDrawerOpen)}
        className={cn(
          "fixed right-0 top-1/2 -translate-y-1/2 z-40 p-2 bg-primary text-primary-foreground rounded-l-lg shadow-lg transition-transform hover:bg-primary/90",
          materialsDrawerOpen && "translate-x-[380px]"
        )}
      >
        <Image className="w-5 h-5" />
      </button>
    </div>
  );
}
