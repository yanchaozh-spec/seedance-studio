"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  Upload,
  Image as ImageIcon,
  ImageOff,
} from "lucide-react";
import { Asset, getAssets, createAssetFromUrl } from "@/lib/assets";
import { toast } from "sonner";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { AssetCard } from "@/components/asset-card";
import { uploadFile } from "@/lib/upload";

export default function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);

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
        
        if (!isImage) {
          toast.error(`${file.name} 格式不支持`);
          continue;
        }

        try {
          const result = await uploadFile(file, {
            projectId: resolvedParams.id,
            type: "image",
          });
          
          await createAssetFromUrl({
            project_id: resolvedParams.id,
            name: file.name,
            type: "image",
            asset_category: "image",
            url: result.url,
            thumbnail_url: result.url,
            size: file.size,
          });
        } catch (uploadError) {
          console.error("上传失败:", uploadError);
          toast.error(`${file.name} 上传失败`);
        }
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

  // 筛选图片素材（排除音频）
  const imageAssets = assets.filter((a) => {
    if (a.type === "audio") return false;
    const isImage = a.asset_category === "image" || !a.asset_category;
    return isImage;
  });

  const keyframeAssets = assets.filter((a) => {
    if (a.type === "audio") return false;
    return a.asset_category === "keyframe";
  });

  return (
    <div className="p-6 h-full flex flex-col" suppressHydrationWarning>
      {/* 头部 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.push(`/projects/${resolvedParams.id}`)}>
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold">素材库</h1>
            <p className="text-sm text-muted-foreground">管理项目图片和音频素材</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
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
            {[...Array(8)].map((_, i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <ImageOff className="w-12 h-12 mb-4" />
            <p>暂无素材</p>
            <p className="text-sm">点击上方按钮上传图片</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 美术资产 */}
            {imageAssets.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                  美术资产 ({imageAssets.length})
                </h2>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {imageAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onClick={() => setSelectedAsset(asset)}
                    />
                  ))}
                </div>
              </div>
            )}
            
            {/* 关键帧 */}
            {keyframeAssets.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                  关键帧 ({keyframeAssets.length})
                </h2>
                <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                  {keyframeAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onClick={() => setSelectedAsset(asset)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 详情弹窗 */}
      <AssetDetailDialog
        asset={selectedAsset}
        allAssets={assets}
        onClose={() => setSelectedAsset(null)}
        onUpdate={() => {
          loadAssets();
        }}
      />
    </div>
  );
}
