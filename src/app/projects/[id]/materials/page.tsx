"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  Upload,
  Image as ImageIcon,
  Scissors,
  ImageOff,
  Music,
} from "lucide-react";
import { Asset, getAssets, createAssetFromUrl, AssetCategory } from "@/lib/assets";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { AssetCard } from "@/components/asset-card";

export default function MaterialsPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [filter, setFilter] = useState<"all" | "keyframe" | "image">("all");

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

        const formData = new FormData();
        formData.append("file", file);
        formData.append("projectId", resolvedParams.id);
        formData.append("type", "image");
        formData.append("asset_category", "image"); // 默认作为美术资产上传

        const response = await fetch("/api/assets/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          throw new Error("上传失败");
        }

        const result = await response.json();
        
        await createAssetFromUrl({
          project_id: resolvedParams.id,
          name: file.name,
          type: "image",
          asset_category: "image",
          url: result.url,
          thumbnail_url: result.thumbnailUrl,
          size: file.size,
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

  // 筛选图片素材（排除音频）
  const filteredAssets = assets.filter((a) => {
    if (a.type === "audio") return false;
    if (filter === "all") return true;
    if (filter === "keyframe") return a.asset_category === "keyframe";
    if (filter === "image") return a.asset_category === "image" || !a.asset_category;
    return true;
  });

  // 按资产类别分组
  const imageAssets = filteredAssets.filter((a) => a.asset_category === "image" || !a.asset_category);
  const keyframeAssets = filteredAssets.filter((a) => a.asset_category === "keyframe");

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
            <p className="text-muted-foreground text-sm mt-1">
              共 {imageAssets.length + keyframeAssets.length} 个素材
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Tab 筛选 */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
            <TabsList>
              <TabsTrigger value="all">全部</TabsTrigger>
              <TabsTrigger value="keyframe">关键帧</TabsTrigger>
              <TabsTrigger value="image">美术资产</TabsTrigger>
            </TabsList>
          </Tabs>
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
              <div key={i} className="aspect-video bg-muted/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : assets.filter(a => a.type !== "audio").length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ImageOff className="w-16 h-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">暂无素材</h3>
            <p className="text-muted-foreground">点击右上角上传图片开始使用</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* 美术资产 */}
            {imageAssets.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <ImageIcon className="w-5 h-5" />
                  美术资产 ({imageAssets.length})
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {imageAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onClick={() => setSelectedAsset(asset)}
                      size="md"
                    />
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

            {/* 关键帧 */}
            {keyframeAssets.length > 0 && (
              <div>
                <h2 className="text-lg font-medium mb-4 flex items-center gap-2">
                  <Scissors className="w-5 h-5" />
                  关键帧 ({keyframeAssets.length})
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {keyframeAssets.map((asset) => (
                    <AssetCard
                      key={asset.id}
                      asset={asset}
                      onClick={() => setSelectedAsset(asset)}
                      size="md"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 详情对话框 */}
      <AssetDetailDialog
        asset={selectedAsset}
        allAssets={assets}
        onClose={() => setSelectedAsset(null)}
        onUpdate={(updatedAsset) => {
          if (updatedAsset) {
            setAssets((prev) =>
              prev.map((a) => (a.id === updatedAsset.id ? { ...a, ...updatedAsset } : a))
            );
          }
          // 同时刷新确保同步
          loadAssets();
        }}
      />
    </div>
  );
}
