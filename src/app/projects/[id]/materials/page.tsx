"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Link2,
  Unlink,
  FolderOpen,
  Play,
} from "lucide-react";
import { Asset, getAssets, createAsset, deleteAsset, bindAudioToImage, unbindAudio } from "@/lib/assets";
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
  const [voiceDescription, setVoiceDescription] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
  
  const audioAssets = allAssets.filter((a) => a.type === "audio" && a.id !== asset?.id);
  const boundAudio = asset?.bound_audio_id 
    ? allAssets.find((a) => a.id === asset.bound_audio_id) 
    : null;

  useEffect(() => {
    if (asset) {
      setVoiceDescription(asset.voice_description || "");
      setSelectedAudioId(asset.bound_audio_id || null);
    }
  }, [asset]);

  const handleBindAudio = async () => {
    if (!asset || !selectedAudioId) return;
    try {
      setBinding(true);
      await bindAudioToImage(asset.id, selectedAudioId, voiceDescription || undefined);
      toast.success("绑定成功");
      onUpdate();
      onClose();
    } catch {
      toast.error("绑定失败");
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
          {/* 预览 */}
          {asset.type === "image" ? (
            <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
              {asset.thumbnail_url ? (
                <img
                  src={asset.thumbnail_url}
                  alt={asset.name}
                  className="w-full h-full object-contain"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <ImageIcon className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
            </div>
          ) : (
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

          {/* 绑定音频（仅图片显示） */}
          {asset.type === "image" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">绑定音频</label>
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
                  <Select value={selectedAudioId || ""} onValueChange={setSelectedAudioId}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择音频文件" />
                    </SelectTrigger>
                    <SelectContent>
                      {audioAssets.map((audio) => (
                        <SelectItem key={audio.id} value={audio.id}>
                          {audio.name}
                        </SelectItem>
                      ))}
                      {audioAssets.length === 0 && (
                        <div className="p-2 text-sm text-muted-foreground text-center">
                          暂无音频素材
                        </div>
                      )}
                    </SelectContent>
                  </Select>
                  
                  <Input
                    placeholder="声线描述（如：轻柔女声）"
                    value={voiceDescription}
                    onChange={(e) => setVoiceDescription(e.target.value)}
                  />
                  
                  <Button 
                    onClick={handleBindAudio} 
                    disabled={!selectedAudioId || binding}
                    className="w-full"
                  >
                    <Link2 className="w-4 h-4 mr-2" />
                    绑定
                  </Button>
                </div>
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
  const [filter, setFilter] = useState<"all" | "image" | "audio">("all");

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
        await createAsset({
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
    return a.type === filter;
  });

  const imageAssets = filteredAssets.filter((a) => a.type === "image");
  const audioAssets = filteredAssets.filter((a) => a.type === "audio");

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
              共 {assets.length} 个素材（图片 {assets.filter((a) => a.type === "image").length}，音频 {assets.filter((a) => a.type === "audio").length}）
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
              <SelectItem value="audio">音频</SelectItem>
            </SelectContent>
          </Select>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*,audio/*"
              onChange={(e) => handleUpload(e.target.files)}
              className="hidden"
              disabled={uploading}
            />
            <Button asChild disabled={uploading}>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "上传中..." : "上传素材"}
              </span>
            </Button>
          </label>
        </div>
      </div>

      {/* 上传区域 */}
      <div
        className="border-2 border-dashed border-muted-foreground/20 rounded-lg p-8 mb-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
        onClick={() => document.querySelector<HTMLInputElement>('input[type="file"]')?.click()}
      >
        <Upload className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
        <p className="text-muted-foreground">
          拖拽图片或音频文件到此处，或点击上传
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          支持 .png, .jpg, .gif, .mp3, .wav 等格式
        </p>
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
            <p className="text-muted-foreground">上传图片或音频开始使用</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 图片素材 */}
            {imageAssets.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  图片素材 ({imageAssets.length})
                </h2>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {imageAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group relative aspect-square bg-muted rounded-lg overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                      onClick={() => setSelectedAsset(asset)}
                    >
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
                      
                      {/* 音频绑定标记 */}
                      {asset.bound_audio_id && (
                        <div className="absolute top-2 right-2 bg-primary text-primary-foreground text-xs px-1.5 py-0.5 rounded flex items-center gap-1">
                          <Music className="w-3 h-3" />
                        </div>
                      )}
                      
                      {/* 悬停覆盖层 */}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <span className="text-white text-sm font-medium">查看详情</span>
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
                    <div className="aspect-square border-2 border-dashed border-muted-foreground/20 rounded-lg flex flex-col items-center justify-center hover:border-primary/50 transition-colors">
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">添加图片</span>
                    </div>
                  </label>
                </div>
              </div>
            )}

            {/* 音频素材 */}
            {audioAssets.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Music className="w-5 h-5" />
                  音频素材 ({audioAssets.length})
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {audioAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className="group bg-muted rounded-lg p-4 cursor-pointer hover:bg-muted/80 transition-colors"
                      onClick={() => setSelectedAsset(asset)}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Music className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{asset.name}</p>
                          {asset.duration && (
                            <p className="text-xs text-muted-foreground">
                              {Math.floor(asset.duration / 60)}:{String(asset.duration % 60).padStart(2, "0")}
                            </p>
                          )}
                        </div>
                      </div>
                      <audio src={asset.url} controls className="w-full h-8" />
                    </div>
                  ))}
                  
                  {/* 添加按钮 */}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="audio/*"
                      multiple
                      onChange={(e) => handleUpload(e.target.files)}
                      className="hidden"
                    />
                    <div className="bg-muted rounded-lg p-4 flex flex-col items-center justify-center hover:bg-muted/80 transition-colors min-h-[100px] border-2 border-dashed border-muted-foreground/20">
                      <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">添加音频</span>
                    </div>
                  </label>
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
