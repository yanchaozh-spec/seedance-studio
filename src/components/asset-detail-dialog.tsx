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
  Trash2,
  Scissors,
} from "lucide-react";
import { Asset, deleteAsset } from "@/lib/assets";
import { toast } from "sonner";

interface AssetDetailDialogProps {
  asset: Asset | null;
  allAssets: Asset[];
  onClose: () => void;
  onUpdate: () => void;
}

export function AssetDetailDialog({ asset, allAssets, onClose, onUpdate }: AssetDetailDialogProps) {
  const [binding, setBinding] = useState(false);
  const [keyframeDescription, setKeyframeDescription] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isRenaming, setIsRenaming] = useState(false);
  const [assetCategory, setAssetCategory] = useState<"keyframe" | "image">("image");

  useEffect(() => {
    if (asset) {
      setKeyframeDescription(asset.keyframe_description || "");
      setDisplayName(asset.display_name || asset.name);
      setAssetCategory(asset.asset_category || "image");
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

  const handleUpdateCategory = async () => {
    if (!asset) return;
    try {
      setBinding(true);
      await fetch(`/api/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asset_category: assetCategory }),
      });
      toast.success("类型已更新");
      onUpdate();
    } catch {
      toast.error("更新失败");
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
            {asset.asset_category === "image" && (
              <div className="absolute top-2 left-2 bg-secondary text-secondary-foreground text-xs px-2 py-1 rounded">
                美术资产
              </div>
            )}
          </div>

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
            <Button 
              onClick={handleUpdateCategory} 
              disabled={binding || assetCategory === (asset.asset_category || "image")}
              className="w-full"
              variant="secondary"
            >
              保存类型
            </Button>
            <p className="text-xs text-muted-foreground">
              关键帧：用于提示词拼接，会在生成视频时作为参考
            </p>
          </div>

          {/* 关键帧描述编辑 */}
          <div className="space-y-3">
            <label className="text-sm font-medium">关键帧描述</label>
            <Input
              placeholder="描述该素材的特征（如：视频首帧，海边日落）"
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
            {asset.asset_category === "keyframe" && asset.keyframe_source_task_id && (
              <p className="text-xs text-muted-foreground">
                来源任务: {asset.keyframe_source_task_id.slice(0, 8)}...
              </p>
            )}
          </div>
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
