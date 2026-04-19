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
  Plus,
  X,
  Check,
  Music,
  Video,
} from "lucide-react";
import { Asset, getAssets, deleteAsset, reorderAssets, getAssetKind } from "@/lib/assets";
import { toast } from "sonner";
import { AssetDetailDialog } from "@/components/asset-detail-dialog";
import { AssetCard } from "@/components/asset-card";
import { uploadFile } from "@/lib/upload";
import { extractVideoThumbnail } from "@/lib/video-thumbnail";
import { emitAssetsChanged } from "@/lib/events";
import { Input } from "@/components/ui/input";
import { GlobalAvatar, getGlobalAvatars, addGlobalAvatar } from "@/lib/global-avatars";
import { ThumbnailUpload } from "@/components/thumbnail-upload";
import { useSettingsStore } from "@/lib/settings";

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
  const [virtualAvatarDialogOpen, setVirtualAvatarDialogOpen] = useState(false);
  const [avatarDialogMode, setAvatarDialogMode] = useState<"manual" | "select">("select");
  const [globalAvatars, setGlobalAvatars] = useState<GlobalAvatar[]>([]);
  const [virtualAvatarForm, setVirtualAvatarForm] = useState({ assetId: "", name: "", thumbnailUrl: "", description: "" });
  const [virtualAvatarThumbnailFile, setVirtualAvatarThumbnailFile] = useState<File | null>(null);
  const [virtualAvatarThumbnailPreview, setVirtualAvatarThumbnailPreview] = useState<string | null>(null);
  const [virtualAvatarUploading, setVirtualAvatarUploading] = useState(false);

  useEffect(() => {
    loadAssets();
  }, [resolvedParams.id]);

  // 加载全局虚拟人像库
  useEffect(() => {
    if (virtualAvatarDialogOpen) {
      getGlobalAvatars().then(setGlobalAvatars).catch(console.error);
    }
  }, [virtualAvatarDialogOpen]);

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

  const handleUpload = async (files: FileList | null, assetType: "image" | "audio" | "video" = "image") => {
    if (!files || files.length === 0) return;
    
    try {
      setUploading(true);
      let uploadCount = 0;
      
      for (const file of Array.from(files)) {
        const isValidType = assetType === "image" ? file.type.startsWith("image/")
          : assetType === "audio" ? file.type.startsWith("audio/")
          : file.type.startsWith("video/");
        
        if (!isValidType) {
          toast.error(`${file.name} 格式不支持，请上传${assetType === "image" ? "图片" : assetType === "audio" ? "音频" : "视频"}文件`);
          continue;
        }

        try {
          // 视频类型：先截取第一帧作为缩略图
          let thumbnailUrl: string | null = null;
          if (assetType === "video") {
            try {
              const thumbBlob = await extractVideoThumbnail(file);
              const thumbFile = new File([thumbBlob], `thumb_${file.name}.jpg`, { type: "image/jpeg" });
              const thumbResult = await uploadFile(thumbFile, {
                projectId: resolvedParams.id,
                type: "image",
                skipDb: true, // 缩略图不需要创建素材记录
              });
              thumbnailUrl = thumbResult.url;
            } catch (thumbErr) {
              console.warn("视频截帧失败:", thumbErr);
            }
          }

          const result = await uploadFile(file, {
            projectId: resolvedParams.id,
            type: assetType,
          });

          // 如果是视频且有缩略图，更新 asset 记录
          if (thumbnailUrl && result.id) {
            try {
              await fetch(`/api/assets/${result.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ thumbnail_url: thumbnailUrl }),
              });
            } catch (patchErr) {
              console.warn("更新视频缩略图失败:", patchErr);
            }
          }

          uploadCount++;
        } catch (uploadError) {
          console.error("上传失败:", uploadError);
          toast.error(`${file.name} 上传失败`);
        }
      }
      
      if (uploadCount > 0) {
        toast.success(`成功上传 ${uploadCount} 个${assetType === "image" ? "图片" : assetType === "audio" ? "音频" : "视频"}素材`);
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

  // 筛选素材按分类
  const imageAssets = assets.filter((a) => getAssetKind(a) === "image");
  const keyframeAssets = assets.filter((a) => getAssetKind(a) === "keyframe");
  const virtualAvatarAssets = assets.filter((a) => getAssetKind(a) === "virtualAvatar");
  const audioAssets = assets.filter((a) => getAssetKind(a) === "audio");
  const videoAssets = assets.filter((a) => getAssetKind(a) === "video");

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
            <p className="text-sm text-muted-foreground">管理项目图片、音频和视频素材</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => setVirtualAvatarDialogOpen(true)}>
            <UserRound className="w-4 h-4 mr-2" />
            添加虚拟人像
          </Button>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="audio/*"
              onChange={(e) => handleUpload(e.target.files, "audio")}
              className="hidden"
              disabled={uploading}
            />
            <Button asChild disabled={uploading} variant="outline">
              <span>
                <Music className="w-4 h-4 mr-2" />
                上传音频
              </span>
            </Button>
          </label>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="video/*"
              onChange={(e) => handleUpload(e.target.files, "video")}
              className="hidden"
              disabled={uploading}
            />
            <Button asChild disabled={uploading} variant="outline">
              <span>
                <Video className="w-4 h-4 mr-2" />
                上传视频
              </span>
            </Button>
          </label>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept="image/*"
              onChange={(e) => handleUpload(e.target.files, "image")}
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
            
            {/* 虚拟人像 */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                <UserRound className="w-3.5 h-3.5" />
                虚拟人像 ({virtualAvatarAssets.length})
              </h2>
              {virtualAvatarAssets.length > 0 ? (
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
              ) : (
                <div className="text-center py-6 border border-dashed rounded-lg text-muted-foreground">
                  <UserRound className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                  <p className="text-sm mb-2">暂无虚拟人像</p>
                  <Button size="sm" variant="outline" onClick={() => setVirtualAvatarDialogOpen(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    添加虚拟人像
                  </Button>
                </div>
              )}
            </div>

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

            {/* 音频素材 */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                <Music className="w-3.5 h-3.5" />
                音频 ({audioAssets.length})
              </h2>
              {audioAssets.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleDragEnd(event, audioAssets)}
                >
                  <SortableContext items={audioAssets.map((a) => a.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {audioAssets.map((asset) => (
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
              ) : (
                <div className="text-center py-6 border border-dashed rounded-lg text-muted-foreground">
                  <Music className="w-6 h-6 mx-auto mb-2 text-violet-400" />
                  <p className="text-sm mb-2">暂无音频素材</p>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="audio/*"
                      onChange={(e) => handleUpload(e.target.files, "audio")}
                      className="hidden"
                    />
                    <Button size="sm" variant="outline" asChild>
                      <span>
                        <Upload className="w-3.5 h-3.5 mr-1" />
                        上传音频
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>

            {/* 视频素材 */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-1">
                <Video className="w-3.5 h-3.5" />
                视频 ({videoAssets.length})
              </h2>
              {videoAssets.length > 0 ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleDragEnd(event, videoAssets)}
                >
                  <SortableContext items={videoAssets.map((a) => a.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                      {videoAssets.map((asset) => (
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
              ) : (
                <div className="text-center py-6 border border-dashed rounded-lg text-muted-foreground">
                  <Video className="w-6 h-6 mx-auto mb-2 text-cyan-400" />
                  <p className="text-sm mb-2">暂无视频素材</p>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      multiple
                      accept="video/*"
                      onChange={(e) => handleUpload(e.target.files, "video")}
                      className="hidden"
                    />
                    <Button size="sm" variant="outline" asChild>
                      <span>
                        <Upload className="w-3.5 h-3.5 mr-1" />
                        上传视频
                      </span>
                    </Button>
                  </label>
                </div>
              )}
            </div>
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

      {/* 虚拟人像对话框 */}
      {virtualAvatarDialogOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => { setVirtualAvatarDialogOpen(false); setVirtualAvatarThumbnailFile(null); setVirtualAvatarThumbnailPreview(null); }}>
          <div className="bg-background rounded-lg p-6 max-w-lg w-full mx-4 max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4 shrink-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <UserRound className="w-5 h-5" />
                添加虚拟人像
              </h2>
              <Button variant="ghost" size="sm" onClick={() => { setVirtualAvatarDialogOpen(false); setVirtualAvatarThumbnailFile(null); setVirtualAvatarThumbnailPreview(null); }}>
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* 模式切换 */}
            <div className="flex gap-2 mb-4 shrink-0">
              <Button
                variant={avatarDialogMode === "select" ? "default" : "outline"}
                size="sm"
                onClick={() => setAvatarDialogMode("select")}
                className="flex-1"
              >
                从人像库选择
              </Button>
              <Button
                variant={avatarDialogMode === "manual" ? "default" : "outline"}
                size="sm"
                onClick={() => setAvatarDialogMode("manual")}
                className="flex-1"
              >
                手动输入
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {avatarDialogMode === "select" ? (
                globalAvatars.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserRound className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                    <p className="text-sm mb-1">全局人像库为空</p>
                    <p className="text-xs mb-3">请先在主页添加虚拟人像，或切换为手动输入</p>
                    <Button size="sm" variant="outline" onClick={() => setAvatarDialogMode("manual")}>
                      手动输入
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {globalAvatars.map((ga) => (
                      <div
                        key={ga.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:border-purple-500/50 hover:bg-muted/50 ${
                          virtualAvatarForm.assetId === ga.asset_id ? "border-purple-500 bg-purple-500/5" : ""
                        }`}
                        onClick={() => {
                          setVirtualAvatarForm({
                            assetId: ga.asset_id,
                            name: "",
                            thumbnailUrl: ga.thumbnail_url || "",
                            description: ga.description || "",
                          });
                          setVirtualAvatarThumbnailFile(null);
                          setVirtualAvatarThumbnailPreview(null);
                        }}
                      >
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                          {ga.thumbnail_url ? (
                            <img src={ga.thumbnail_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <UserRound className="w-5 h-5 text-purple-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-mono text-muted-foreground truncate">{ga.asset_id}</p>
                          {ga.description && (
                            <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{ga.description}</p>
                          )}
                        </div>
                        {virtualAvatarForm.assetId === ga.asset_id && (
                          <div className="w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      Asset ID <span className="text-destructive">*</span>
                    </label>
                    <Input
                      placeholder="如：asset-202604011823-6d4x2"
                      value={virtualAvatarForm.assetId}
                      onChange={(e) => setVirtualAvatarForm((prev) => ({ ...prev, assetId: e.target.value.trim() }))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      从
                      <a
                        href="https://www.volcengine.com/docs/82379/2223965"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline hover:text-primary transition-colors mx-0.5"
                      >
                        官方虚拟人像库
                      </a>
                      获取 Asset ID
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      缩略图 <span className="text-muted-foreground font-normal">(可选，仅用于 UI 预览)</span>
                    </label>
                    <ThumbnailUpload
                      url={virtualAvatarForm.thumbnailUrl}
                      onUrlChange={(v) => setVirtualAvatarForm((prev) => ({ ...prev, thumbnailUrl: v }))}
                      preview={virtualAvatarThumbnailPreview}
                      onPreviewChange={setVirtualAvatarThumbnailPreview}
                      file={virtualAvatarThumbnailFile}
                      onFileChange={setVirtualAvatarThumbnailFile}
                      uploading={virtualAvatarUploading}
                      hint="缩略图仅用于素材池显示，不发送给 API"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">
                      描述 <span className="text-muted-foreground font-normal">(可选)</span>
                    </label>
                    <Input
                      placeholder="如：30岁女性，短发，专业形象"
                      value={virtualAvatarForm.description}
                      onChange={(e) => setVirtualAvatarForm((prev) => ({ ...prev, description: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">人像特征描述，方便辨识和同步到全局人像库</p>
                  </div>
                </>
              )}

              <div>
                <label className="text-sm font-medium mb-1.5 block">
                  角色名称 <span className="text-destructive">*</span>
                </label>
                <Input
                  placeholder="如：女主-李武"
                  value={virtualAvatarForm.name}
                  onChange={(e) => setVirtualAvatarForm((prev) => ({ ...prev, name: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  本项目中使用的角色名，不同项目可设置不同名称
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t mt-4 shrink-0">
              <Button variant="outline" onClick={() => { setVirtualAvatarDialogOpen(false); setVirtualAvatarThumbnailFile(null); setVirtualAvatarThumbnailPreview(null); }}>
                取消
              </Button>
              <Button
                onClick={async () => {
                  if (!virtualAvatarForm.assetId.trim()) {
                    toast.error(avatarDialogMode === "select" ? "请从人像库中选择" : "请输入 Asset ID");
                    return;
                  }
                  if (!virtualAvatarForm.name.trim()) {
                    toast.error("请输入角色名称");
                    return;
                  }
                  try {
                    let thumbnailUrl = virtualAvatarForm.thumbnailUrl.trim() || null;
                    if (virtualAvatarThumbnailFile) {
                      try {
                        setVirtualAvatarUploading(true);
                        const uploadResult = await uploadFile(virtualAvatarThumbnailFile, {
                          projectId: resolvedParams.id,
                          type: "image",
                        });
                        thumbnailUrl = uploadResult.url;
                      } catch (uploadError) {
                        console.error("缩略图上传失败:", uploadError);
                        toast.error("缩略图上传失败，将使用 URL 或留空");
                      } finally {
                        setVirtualAvatarUploading(false);
                      }
                    }

                    const response = await fetch(`/api/projects/${resolvedParams.id}/assets`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: virtualAvatarForm.name.trim(),
                        display_name: virtualAvatarForm.name.trim(),
                        type: "virtual_avatar",
                        asset_id: virtualAvatarForm.assetId.trim(),
                        url: `asset://${virtualAvatarForm.assetId.trim()}`,
                        thumbnail_url: thumbnailUrl,
                        keyframe_description: virtualAvatarForm.description.trim() || null,
                      }),
                    });
                    if (!response.ok) throw new Error("创建失败");

                    // 同步到全局人像库
                    try {
                      const { tosEnabled: syncTosEnabled, tosSettings: syncTosSettings } = useSettingsStore.getState();
                      await addGlobalAvatar({
                        asset_id: virtualAvatarForm.assetId.trim(),
                        thumbnail_url: thumbnailUrl || undefined,
                        description: virtualAvatarForm.description.trim() || undefined,
                        source_project_id: resolvedParams.id,
                      }, syncTosEnabled && syncTosSettings.endpoint ? syncTosSettings : undefined);
                    } catch (syncError) {
                      console.warn("同步到全局人像库失败:", syncError);
                    }

                    // 刷新素材库
                    await loadAssets();
                    emitAssetsChanged(resolvedParams.id, "update");
                    // 重置表单并关闭对话框
                    setVirtualAvatarForm({ assetId: "", name: "", thumbnailUrl: "", description: "" });
                    setVirtualAvatarThumbnailFile(null);
                    setVirtualAvatarThumbnailPreview(null);
                    setVirtualAvatarDialogOpen(false);
                    toast.success("虚拟人像已添加");
                  } catch (error) {
                    console.error("创建虚拟人像失败:", error);
                    toast.error("创建虚拟人像失败");
                  }
                }}
              >
                添加
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
