"use client";

import { useState, useEffect } from "react";
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
  Image as ImageIcon,
  Music,
  Trash2,
  Unlink,
  Upload,
  Scissors,
  Loader2,
} from "lucide-react";
import { Asset, deleteAsset } from "@/lib/assets";
import { toast } from "sonner";

interface AssetDetailDialogProps {
  asset: Asset | null;
  allAssets: Asset[];
  onClose: () => void;
  onUpdate: (updatedAsset?: Asset) => void;
}

export function AssetDetailDialog({ asset, allAssets, onClose, onUpdate }: AssetDetailDialogProps) {
  const [binding, setBinding] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [keyframeDescription, setKeyframeDescription] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [assetCategory, setAssetCategory] = useState<"keyframe" | "image">("image");
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(asset);

  const boundAudio = currentAsset?.bound_audio_id 
    ? allAssets.find((a) => a.id === currentAsset.bound_audio_id) 
    : null;

  useEffect(() => {
    if (asset) {
      setCurrentAsset(asset);
      setKeyframeDescription(asset.keyframe_description || "");
      setDisplayName(asset.display_name || asset.name);
      setAssetCategory(asset.asset_category || "image");
    }
  }, [asset]);

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

      // 绑定音频并获取更新后的素材
      const bindResponse = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bound_audio_id: audioAsset.id }),
      });
      
      if (!bindResponse.ok) throw new Error("绑定失败");
      const updatedAsset = await bindResponse.json();
      
      toast.success("音频上传并绑定成功");
      onUpdate(updatedAsset);
      setCurrentAsset(updatedAsset);
      onClose();
    } catch {
      toast.error("上传失败");
    } finally {
      setUploadingAudio(false);
    }
  };

  // 统一的保存函数
  const handleSave = async () => {
    if (!asset) return;
    try {
      setBinding(true);
      
      // 构建更新数据
      const updates: Record<string, unknown> = {};
      
      // 检查显示名称是否变化
      if (displayName.trim() !== (asset.display_name || asset.name)) {
        updates.display_name = displayName.trim();
      }
      
      // 检查类型是否变化
      if (assetCategory !== (asset.asset_category || "image")) {
        updates.asset_category = assetCategory;
      }
      
      // 检查关键帧描述是否变化
      if (keyframeDescription !== (asset.keyframe_description || "")) {
        updates.keyframe_description = keyframeDescription;
      }
      
      // 如果没有变化，直接关闭
      if (Object.keys(updates).length === 0) {
        onClose();
        return;
      }
      
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) throw new Error("更新失败");
      const updatedAsset = await response.json();
      
      toast.success("保存成功");
      onUpdate(updatedAsset);
      onClose();
    } catch {
      toast.error("保存失败");
    } finally {
      setBinding(false);
    }
  };

  const handleUnbindAudio = async () => {
    if (!asset) return;
    try {
      setBinding(true);
      const response = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bound_audio_id: null }),
      });
      
      if (!response.ok) throw new Error("解除绑定失败");
      const updatedAsset = await response.json();
      
      toast.success("已解除绑定");
      onUpdate(updatedAsset);
      setCurrentAsset(updatedAsset);
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
            <Input
              placeholder="输入显示名称"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
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
              {asset.asset_category === "keyframe" && (
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

          {/* 音频参考（仅美术资产显示） */}
          {assetCategory === "image" && (
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
                    htmlFor="audio-upload-dialog"
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
                    id="audio-upload-dialog"
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleUploadAudio(e.target.files)}
                    disabled={uploadingAudio}
                  />
                  <p className="text-xs text-muted-foreground text-center">
                    支持 MP3、WAV、AAC 等格式
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 素材类型选择 */}
          <div className="space-y-3">
            <label className="text-sm font-medium">素材类型</label>
            <div className="flex gap-2">
              <Button
                variant={assetCategory === "image" ? "default" : "outline"}
                size="sm"
                onClick={() => setAssetCategory("image")}
              >
                美术资产
              </Button>
              <Button
                variant={assetCategory === "keyframe" ? "default" : "outline"}
                size="sm"
                onClick={() => setAssetCategory("keyframe")}
              >
                <Scissors className="w-4 h-4 mr-1" />
                关键帧
              </Button>
            </div>
          </div>

          {/* 关键帧描述编辑 */}
          {assetCategory === "keyframe" && (
            <div className="space-y-3">
              <label className="text-sm font-medium">关键帧描述</label>
              <Input
                placeholder="描述该素材的特征（如：视频首帧，海边日落）"
                value={keyframeDescription}
                onChange={(e) => setKeyframeDescription(e.target.value)}
              />
              {asset.keyframe_source_task_id && (
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
          <Button onClick={handleSave} disabled={binding}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
