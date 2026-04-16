"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  Upload,
  Image as ImageIcon,
  Music,
  Trash2,
  Unlink,
  FolderOpen,
  Play,
  Scissors,
  Loader2,
} from "lucide-react";
import { Asset, getAssets, createAssetFromUrl, deleteAsset, bindAudioToImage, unbindAudio } from "@/lib/assets";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MaterialDetailDialogProps {
  asset: Asset | null;
  allAssets: Asset[];
  onClose: () => void;
  onUpdate: () => void;
}

function MaterialDetailDialog({ asset, allAssets, onClose, onUpdate }: MaterialDetailDialogProps) {
  const [binding, setBinding] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [voiceDescription, setVoiceDescription] = useState("");
  const [keyframeDescription, setKeyframeDescription] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  
  const boundAudio = asset?.bound_audio_id 
    ? allAssets.find((a) => a.id === asset.bound_audio_id) 
    : null;

  useEffect(() => {
    if (asset) {
      setVoiceDescription(asset.voice_description || "");
      setKeyframeDescription(asset.keyframe_description || "");
      setDisplayName(asset.display_name || asset.name);
    }
  }, [asset]);

  const handleRename = async () => {
    if (!asset || !displayName.trim()) return;
    try {
      setIsRenaming(true);
      await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: displayName.trim() }),
      });
      toast.success("重命名成功");
      onUpdate();
    } catch {
      toast.error("重命名失败");
    } finally {
      setIsRenaming(false);
    }
  };

  // 上传音频并绑定到当前图片
  const handleUploadAudio = async (files: FileList | null) => {
    if (!files || files.length === 0 || !asset) return;
    
    const file = files[0];
    if (!file.type.startsWith("audio/")) {
      toast.error("请选择音频文件");
      return;
    }

    try {
      setUploadingAudio(true);
      
      // 上传到对象存储
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", asset.project_id);
      formData.append("type", "audio");

      const response = await fetch("/api/assets/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("上传失败");
      const result = await response.json();

      // 创建素材记录
      const createResponse = await fetch(`/api/projects/${asset.project_id}/assets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          type: "audio",
          url: result.url,
          duration: result.duration,
        }),
      });

      if (!createResponse.ok) throw new Error("创建素材失败");
      const audioAsset = await createResponse.json();

      // 绑定音频到图片
      await bindAudioToImage(asset.id, audioAsset.id);
      
      toast.success("音频上传并绑定成功");
      onUpdate();
      onClose();
    } catch {
      toast.error("上传失败");
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleUpdateKeyframeDescription = async () => {
    if (!asset) return;
    try {
      setBinding(true);
      await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyframe_description: keyframeDescription }),
      });
      toast.success("更新成功");
      onUpdate();
    } catch {
      toast.error("更新失败");
    } finally {
      setBinding(false);
    }
  };

  const handleUnbindAudio = async () => {
    if (!asset) return;
    try {
      setBinding(true);
      await unbindAudio(asset.id);
      toast.success("已解除绑定");
      onUpdate();
      onClose();
    } catch {
      toast.error("解除绑定失败");
    } finally {
      setBinding(false);
    }
  };

  const handleDelete = async () => {
    if (!asset) return;
    try {
      await deleteAsset(asset.id);
      toast.success("删除成功");
      onUpdate();
      onClose();
    } catch {
      toast.error("删除失败");
    }
  };

  if (!asset) return null;

  return (
    <Dialog open={!!asset} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{asset.name}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* 重命名 */}
          <div className="space-y-2">
            <Label>显示名称</Label>
            <div className="flex gap-2">
              <Input
                placeholder="输入显示名称"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleRename}
                disabled={isRenaming || displayName === (asset?.display_name || asset?.name)}
              >
                保存
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              用于提示词中的引用，如：@&quot;显示名称&quot;
            </p>
          </div>

          {/* 预览 */}
          {(asset.type === "image" || asset.type === "keyframe") && (
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              {asset.thumbnail_url || asset.url ? (
                <img
                  src={asset.thumbnail_url || asset.url}
                  alt={asset.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Scissors className="w-16 h-16 text-primary" />
                </div>
              )}
              {asset.type === "keyframe" && (
                <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded">
                  <Scissors className="w-3 h-3 inline mr-1" />
                  关键帧
                </div>
              )}
            </div>
          )}
          
          {asset.type === "audio" && (
            <div className="bg-muted rounded-lg p-4">
              <div className="flex items-center gap-3">
                <Music className="w-8 h-8 text-primary" />
                <div>
                  <p className="font-medium">{asset.name}</p>
                  {asset.duration && (
                    <p className="text-sm text-muted-foreground">
                      {Math.floor(asset.duration / 60)}:{String(asset.duration % 60).padStart(2, "0")}
                    </p>
                  )}
                </div>
              </div>
              <audio src={asset.url} controls className="w-full mt-3" />
            </div>
          )}

          {/* 音频参考（仅图片显示） */}
          {(asset.type === "image" || asset.type === "keyframe") && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">音频参考</label>
                {boundAudio && (
                  <Button variant="ghost" size="sm" onClick={handleUnbindAudio} disabled={binding}>
                    <Unlink className="w-4 h-4 mr-1" />
                    解除
                  </Button>
                )}
              </div>
              
              {boundAudio ? (
                <div className="bg-muted rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-primary" />
                    <span className="text-sm">{boundAudio.name}</span>
                  </div>
                  <audio src={boundAudio.url} controls className="w-full mt-2" />
                </div>
              ) : (
                <div className="space-y-2">
                  <label
                    htmlFor="audio-upload-detail"
                    className="flex items-center justify-center gap-2 w-full h-20 border-2 border-dashed border-muted-foreground/25 rounded-lg cursor-pointer hover:border-primary hover:bg-muted/50 transition-colors"
                  >
                    {uploadingAudio ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span className="text-sm">上传中...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">点击上传音频</span>
                      </>
                    )}
                  </label>
                  <input
                    id="audio-upload-detail"
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleUploadAudio}
                    disabled={uploadingAudio}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    支持 MP3、WAV、AAC 等格式
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 关键帧描述编辑 */}
          {(asset.type === "keyframe" || asset.type === "image") && (
            <div className="space-y-3">
              <label className="text-sm font-medium">关键帧描述</label>
              <Input
                placeholder="描述该关键帧的特征（如：视频首帧，海边日落）"
                value={keyframeDescription}
                onChange={(e) => setKeyframeDescription(e.target.value)}
              />
              <Button 
                onClick={handleUpdateKeyframeDescription} 
                disabled={binding}
                className="w-full"
              >
                <Scissors className="w-4 h-4 mr-2" />
                保存描述
              </Button>
              {asset.type === "keyframe" && asset.keyframe_source_task_id && (
                <p className="text-xs text-muted-foreground">
                  来源任务: {asset.keyframe_source_task_id.slice(0, 8)}...
                </p>
              )}
            </div>
          )}
        </div>
        
        <DialogFooter className="sm:justify-between">
          <Button variant="destructive" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-2" />
            删除
          </Button>
          <Button variant="outline" onClick={onClose}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "audio" | "keyframe">("all");

  useEffect(() => {
    loadAssets();
  }, [resolvedParams.id]);

  const loadAssets = async () => {
    try {
      setLoading(true);
      const data = await getAssets(resolvedParams.id);
      setAssets(data);
    } catch (error) {
      console.error("加载素材失败:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    try {
      setUploading(true);
      
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        const isAudio = file.type.startsWith("audio/");
        
        if (!isImage && !isAudio) {
          toast.error(`${file.name} 格式不支持`);
          continue;
        }

        // 上传到对象存储
        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", resolvedParams.id);
        formData.append("type", isImage ? "image" : "audio");

        const response = await fetch("/api/assets/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("上传失败");
        }

        const result = await response.json();
        
        // 创建素材记录
        await createAssetFromUrl({
          project_id: resolvedParams.id,
          name: file.name,
          type: isImage ? "image" : "audio",
          url: result.url,
          thumbnail_url: result.thumbnailUrl,
          size: file.size,
          duration: result.duration,
        });
      }
      
      toast.success("上传成功");
      loadAssets();
    } catch (error) {
      console.error("上传失败:", error);
      toast.error("上传失败");
    } finally {
      setUploading(false);
    }
  };

  const filteredAssets = assets.filter((a) => {
    if (filter === "all") return true;
    if (filter === "keyframe") return a.type === "keyframe" || a.is_keyframe;
    return a.type === filter;
  });

  const imageAssets = filteredAssets.filter((a) => a.type === "image");
  const keyframeAssets = filteredAssets.filter((a) => a.type === "keyframe");

  return (
    <div className="p-6 h-full flex flex-col">
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/projects/${resolvedParams.id}`)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">素材库</h1>
            <p className="text-muted-foreground text-sm mt-1">
              共 {imageAssets.length + keyframeAssets.length} 个素材
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="image">图片</SelectItem>
              <SelectItem value="keyframe">关键帧</SelectItem>
            </SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
              disabled={uploading}
            />
            <Button asChild disabled={uploading}>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "上传中..." : "上传图片"}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ImageIcon className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无素材</h3>
            <p className="text-muted-foreground">点击右上角上传图片开始使用</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 图片素材 */}
            {imageAssets.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  {imageAssets.map((asset, idx) => (
                    <span key={asset.id}>
                      {asset.display_name || asset.name}
                      {idx < imageAssets.length - 1 && "、"}
                    </span>
                  ))}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {imageAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group bg-muted rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <div className="aspect-video relative">
                        {asset.thumbnail_url ? (
                          <img
                            src={asset.thumbnail_url}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="w-12 h-12 text-muted-foreground" />
                          </div>
                        )}
                        {/* 悬停覆盖层 */}
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                          <span className="text-white text-sm font-medium">查看详情</span>
                        </div>
                      </div>
                      {/* 底部信息 */}
                      <div className="p-2 space-y-1">
                        <span className="text-xs truncate block">
                          {asset.display_name || asset.name}
                        </span>
                        {/* 音频参考按钮 */}
                        <div className={cn(
                          "flex items-center justify-center gap-1 py-1 rounded text-xs",
                          asset.bound_audio_id 
                            ? "bg-primary text-primary-foreground" 
                            : "bg-muted-foreground/20 text-muted-foreground"
                        )}>
                          <Music className="w-3 h-3" />
                          <span>{asset.bound_audio_id ? "有" : "无"}声音</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {/* 添加按钮 */}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => handleUpload(e.target.files)}
                      className="hidden"
                    />
                    <div className="aspect-video border-2 border-dashed border-muted-foreground/20 rounded-lg flex flex-col items-center justify-center hover:border-primary/50 transition-colors">
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">添加图片</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* 关键帧素材 */}
            {keyframeAssets.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Scissors className="w-5 h-5" />
                  {keyframeAssets.map((asset, idx) => (
                    <span key={asset.id}>
                      {asset.display_name || asset.name}
                      {idx < keyframeAssets.length - 1 && "、"}
                    </span>
                  ))}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {keyframeAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group bg-muted rounded-lg overflow-hidden cursor-pointer hover:bg-muted/80 transition-colors border-2 border-primary/30"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <div className="aspect-video relative">
                        {asset.thumbnail_url || asset.url ? (
                          <img
                            src={asset.thumbnail_url || asset.url}
                            alt={asset.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Scissors className="w-8 h-8 text-primary" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      </div>
                      <div className="p-2">
                        <p className="text-sm font-medium truncate">{asset.display_name || asset.name}</p>
                        {asset.keyframe_description && (
                          <p className="text-xs text-muted-foreground truncate">{asset.keyframe_description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 详情对话框 */}
      <MaterialDetailDialog
        asset={selectedAsset}
        allAssets={assets}
        onClose={() => setSelectedAsset(null)}
        onUpdate={loadAssets}
      />
    </div>
  );
}
