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
  Download,
} from "lucide-react";
import { Asset, deleteAsset } from "@/lib/assets";
import { toast } from "sonner";
import { uploadFile } from "@/lib/upload";

interface AssetDetailDialogProps {
  asset: Asset | null;
  allAssets: Asset[];
  onClose: () => void;
  onUpdate: (updatedAsset?: Asset) => void;
}

export function AssetDetailDialog({ asset, allAssets, onClose, onUpdate }: AssetDetailDialogProps) {
  const [binding, setBinding] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  // 本地存储新上传的音频，用于对话框内显示（这些音频不在 allAssets 中）
  const [localNewAudios, setLocalNewAudios] = useState<Asset[]>([]);
  const [keyframeDescription, setKeyframeDescription] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [assetCategory, setAssetCategory] = useState<"keyframe" | "image">("image");
  const [currentAsset, setCurrentAsset] = useState<Asset | null>(asset);

  // 合并 allAssets 和 localNewAudios 用于搜索
  const allAssetsWithNew = [...allAssets, ...localNewAudios];
  
  const boundAudio = currentAsset?.bound_audio_id 
    ? allAssetsWithNew.find((a) => a.id === currentAsset.bound_audio_id) 
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
      
      // 使用统一的 uploadFile 函数，会自动处理 TOS 配置
      // uploadFile 内部会创建素材记录，并返回新创建的音频 ID
      const uploadResult = await uploadFile(file, {
        projectId: asset.project_id,
        type: "audio",
      });
      
      if (!uploadResult.id) {
        toast.error("上传成功但未获取到音频 ID");
        return;
      }

      // 构建新音频对象（从 API 响应中获取 URL）
      const newAudio: Asset = {
        id: uploadResult.id,
        project_id: asset.project_id,
        name: file.name.replace(/\.[^/.]+$/, ""),
        type: "audio",
        url: uploadResult.url,
        size: file.size,
        asset_category: "image",
        created_at: new Date().toISOString(),
      };
      
      // 将新音频添加到本地状态，确保对话框内能找到
      setLocalNewAudios((prev) => [...prev, newAudio]);
      
      // 绑定音频到当前图片
      const bindResponse = await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bound_audio_id: uploadResult.id }),
      });
      
      if (!bindResponse.ok) throw new Error("绑定失败");
      const updatedAsset = await bindResponse.json();
      
      console.log("[AssetDetailDialog] Audio bound:", { 
        audioId: uploadResult.id, 
        updatedAsset 
      });
      
      toast.success("音频上传并绑定成功");
      onUpdate(updatedAsset);
      setCurrentAsset(updatedAsset);
      // 不关闭对话框，让用户看到更新后的状态
    } catch (error) {
      console.error("上传失败:", error);
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
      // 不关闭对话框，让用户看到更新后的状态
    } catch {
      toast.error("解除绑定失败");
    } finally {
      setBinding(false);
    }
  };

  // 下载图片/关键帧
  const handleDownload = async () => {
    if (!asset || !asset.id) return;
    
    try {
      // 通过后端 API 代理下载，解决跨域问题
      const response = await fetch(`/api/assets/${asset.id}/download`);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "下载失败" }));
        throw new Error(error.error || "下载失败");
      }
      
      const blob = await response.blob();
      
      // 获取文件名
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = asset.name || "frame";
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?(.+)"?/);
        if (match) {
          filename = match[1];
        }
      }
      
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success("下载成功");
    } catch (error) {
      console.error("下载失败:", error);
      toast.error(error instanceof Error ? error.message : "下载失败");
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
          <div className="flex gap-2">
            {/* 下载按钮 - 仅图片类型显示 */}
            {(asset.type === "image" || asset.type === "keyframe" || asset.asset_category === "keyframe") && (
              <Button variant="outline" onClick={handleDownload}>
                <Download className="w-4 h-4 mr-2" />
                下载
              </Button>
            )}
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              删除
            </Button>
          </div>
          <Button onClick={handleSave} disabled={binding}>
            保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
