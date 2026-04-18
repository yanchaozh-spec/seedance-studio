"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  Upload,
  Image as ImageIcon,
  ImageOff,
  GripVertical,
  UserRound,
} from "lucide-react";
import { Asset, getAssets, deleteAsset, reorderAssets } from "@/lib/assets";
import { toast } from "sonner";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { AssetCard } from "@/components/asset-card";
import { uploadFile } from "@/lib/upload";
import { emitAssetsChanged } from "@/lib/events";

// dnd-kit 拖拽排序
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// 可排序的素材卡片（用于总素材库页面）
function SortableAssetCard({
  asset,
  onClick,
  onRemove,
}: {
  asset: Asset;
  onClick: () => void;
  onRemove: () => void;
}) {
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
    <div ref={setNodeRef} style={style} className="relative group">
      {/* 拖拽手柄 */}
      <div className="absolute top-1 left-1 z-20">
        <div
          {...attributes}
          {...listeners}
          className="p-1 rounded bg-background/80 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3 h-3 text-muted-foreground" />
        </div>
      </div>
      <AssetCard
        asset={asset}
        onClick={onClick}
        onRemove={onRemove}
        showRemove
        showName
      />
    </div>
  );
}

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
      let uploadCount = 0;
      
      for (const file of Array.from(files)) {
        const isImage = file.type.startsWith("image/");
        
        if (!isImage) {
          toast.error(`${file.name} 格式不支持`);
          continue;
        }

        try {
          await uploadFile(file, {
            projectId: resolvedParams.id,
            type: "image",
          });
          uploadCount++;
        } catch (uploadError) {
          console.error("上传失败:", uploadError);
          toast.error(`${file.name} 上传失败`);
        }
      }
      
      if (uploadCount > 0) {
        toast.success(`成功上传 ${uploadCount} 个素材`);
      }
      loadAssets();
      emitAssetsChanged(resolvedParams.id, 'upload');
    } catch (error) {
      console.error("上传失败:", error);
      toast.error("上传失败");
    } finally {
      setUploading(false);
    }
  };

  // 删除素材
  const handleDeleteAsset = async (assetId: string) => {
    try {
      await deleteAsset(assetId);
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
      toast.success("素材已删除");
      emitAssetsChanged(resolvedParams.id, 'delete');
    } catch (error) {
      console.error("删除素材失败:", error);
      toast.error("删除失败");
    }
  };

  // 筛选图片素材（排除音频和虚拟人像）
  const imageAssets = assets.filter((a) => {
    if (a.type === "audio") return false;
    if (a.type === "virtual_avatar") return false;
    const isImage = a.asset_category === "image" || !a.asset_category;
    return isImage;
  });

  const keyframeAssets = assets.filter((a) => {
    if (a.type === "audio") return false;
    if (a.type === "virtual_avatar") return false;
    return a.asset_category === "keyframe";
  });

  const virtualAvatarAssets = assets.filter((a) => {
    return a.type === "virtual_avatar";
  });

  // 拖拽排序传感器
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // 拖拽排序处理
  const handleDragEnd = useCallback(
    (event: DragEndEvent, assetList: Asset[]) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = assetList.findIndex((a) => a.id === active.id);
      const newIndex = assetList.findIndex((a) => a.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      // 乐观更新
      const reordered = [...assetList];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved);

      // 更新 assets：保持其他素材不变，替换当前分组的排序
      const movedIds = new Set(assetList.map((a) => a.id));
      const otherAssets = assets.filter((m) => !movedIds.has(m.id));
      setAssets([...otherAssets, ...reordered]);

      // 持久化排序到后端
      const items = reordered.map((a, i) => ({ id: a.id, sort_order: i }));
      reorderAssets(items).then(() => {
        // 通知其他组件（如右侧侧边栏）素材顺序已变更
        emitAssetsChanged(resolvedParams.id, 'reorder');
      }).catch((err) => {
        console.error("保存排序失败:", err);
        toast.error("排序保存失败");
      });
    },
    [assets]
  );

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
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleDragEnd(event, imageAssets)}
                >
                  <SortableContext items={imageAssets.map((a) => a.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {imageAssets.map((asset) => (
                        <SortableAssetCard
                          key={asset.id}
                          asset={asset}
                          onClick={() => setSelectedAsset(asset)}
                          onRemove={() => handleDeleteAsset(asset.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}
            
            {/* 关键帧 */}
            {keyframeAssets.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3">
                  关键帧 ({keyframeAssets.length})
                </h2>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleDragEnd(event, keyframeAssets)}
                >
                  <SortableContext items={keyframeAssets.map((a) => a.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {keyframeAssets.map((asset) => (
                        <SortableAssetCard
                          key={asset.id}
                          asset={asset}
                          onClick={() => setSelectedAsset(asset)}
                          onRemove={() => handleDeleteAsset(asset.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            )}

            {/* 虚拟人像 */}
            {virtualAvatarAssets.length > 0 && (
              <div>
                <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                  <UserRound className="w-3.5 h-3.5" />
                  虚拟人像 ({virtualAvatarAssets.length})
                </h2>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleDragEnd(event, virtualAvatarAssets)}
                >
                  <SortableContext items={virtualAvatarAssets.map((a) => a.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {virtualAvatarAssets.map((asset) => (
                        <SortableAssetCard
                          key={asset.id}
                          asset={asset}
                          onClick={() => setSelectedAsset(asset)}
                          onRemove={() => handleDeleteAsset(asset.id)}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
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
