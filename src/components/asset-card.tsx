"use client";

import { cn } from "@/lib/utils";
import { Image as ImageIcon, Music, Video, X, Check, Scissors, UserRound } from "lucide-react";
import type { Asset } from "@/lib/assets";

interface AssetCardProps {
  asset: Asset & { isActivated?: boolean };
  onClick?: () => void;
  onRemove?: () => void;
  onToggleActivation?: () => void;
  showRemove?: boolean;
  showActivation?: boolean;
  showName?: boolean;
  size?: "sm" | "md";
  className?: string;
}

// 检查是否为关键帧类型
function isKeyframeAsset(asset: Asset): boolean {
  return asset.asset_category === "keyframe";
}

export function AssetCard({
  asset,
  onClick,
  onRemove,
  onToggleActivation,
  showRemove = true,
  showActivation = false,
  showName = false,
  size = "sm",
  className,
}: AssetCardProps) {
  const isKeyframe = isKeyframeAsset(asset);

  return (
    <div
      className={cn(
        "relative group bg-card border rounded-lg overflow-hidden cursor-pointer transition-all",
        size === "sm" ? "w-20" : "w-full",
        className
      )}
      onClick={onClick}
    >
      {/* 删除按钮 */}
      {showRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer"
        >
          <X className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
        </button>
      )}

      {/* 类型标签 - 关键帧 */}
      {isKeyframe && (
        <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[8px] px-1 py-0.5 rounded flex items-center gap-0.5 z-10">
          <Scissors className="w-2.5 h-2.5" />
          <span>关键帧</span>
        </div>
      )}
      {/* 类型标签 - 虚拟人像 */}
      {asset.type === "virtual_avatar" && (
        <div className="absolute top-1 left-1 bg-purple-600 text-white text-[8px] px-1 py-0.5 rounded flex items-center gap-0.5 z-10">
          <UserRound className="w-2.5 h-2.5" />
          <span>人像</span>
        </div>
      )}
      {/* 类型标签 - 音频 */}
      {asset.type === "audio" && (
        <div className="absolute top-1 left-1 bg-violet-600 text-white text-[8px] px-1 py-0.5 rounded flex items-center gap-0.5 z-10">
          <Music className="w-2.5 h-2.5" />
          <span>音频</span>
        </div>
      )}
      {/* 类型标签 - 视频 */}
      {asset.type === "video" && (
        <div className="absolute top-1 left-1 bg-cyan-600 text-white text-[8px] px-1 py-0.5 rounded flex items-center gap-0.5 z-10">
          <Video className="w-2.5 h-2.5" />
          <span>视频</span>
        </div>
      )}

      {/* 图片/缩略图 */}
      {asset.thumbnail_url ? (
        <div className={cn("w-full flex items-center justify-center bg-muted", size === "sm" ? "aspect-square" : "aspect-video")}>
          <img
            src={asset.thumbnail_url}
            alt={asset.name}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      ) : asset.type === "audio" ? (
        <div className={cn("w-full flex flex-col items-center justify-center bg-gradient-to-br from-violet-500/10 to-indigo-500/10 gap-1", size === "sm" ? "aspect-square" : "aspect-video")}>
          <Music className={cn(size === "sm" ? "w-5 h-5" : "w-7 h-7", "text-violet-400")} />
          <div className="flex items-end gap-0.5 h-3">
            {[3,6,4,8,5,7,3,6].map((h, i) => (
              <div key={i} className={cn("bg-violet-400/50 rounded-full", size === "sm" ? "w-[2px]" : "w-0.5")} style={{ height: `${h * (size === "sm" ? 1.5 : 2)}px` }} />
            ))}
          </div>
        </div>
      ) : asset.type === "video" ? (
        <div className={cn("w-full flex items-center justify-center bg-gradient-to-br from-cyan-500/10 to-blue-500/10", size === "sm" ? "aspect-square" : "aspect-video")}>
          <Video className={cn(size === "sm" ? "w-6 h-6" : "w-8 h-8", "text-cyan-400")} />
        </div>
      ) : asset.type === "virtual_avatar" ? (
        <div className={cn("w-full flex items-center justify-center bg-purple-500/10", size === "sm" ? "aspect-square" : "aspect-video")}>
          <UserRound className={cn(size === "sm" ? "w-6 h-6" : "w-8 h-8", "text-purple-400")} />
        </div>
      ) : asset.url ? (
        <div className={cn("w-full flex items-center justify-center bg-muted", size === "sm" ? "aspect-square" : "aspect-video")}>
          <img
            src={asset.url}
            alt={asset.name}
            className="max-w-full max-h-full object-contain"
          />
        </div>
      ) : (
        <div className={cn(
          "w-full flex items-center justify-center bg-muted",
          size === "sm" ? "aspect-square" : "aspect-video"
        )}>
          <ImageIcon className={cn(size === "sm" ? "w-6 h-6" : "w-10 h-10", "text-muted-foreground")} />
        </div>
      )}

      {/* 底部信息栏 */}
      <div className={cn("p-1 space-y-0.5", size === "md" && "p-2")}>
        {/* 名称显示 */}
        {showName && (
          <p 
            className={cn(
              "text-center truncate",
              size === "sm" ? "text-[10px]" : "text-xs"
            )}
            title={asset.display_name || asset.name}
          >
            {asset.display_name || asset.name}
          </p>
        )}

        {/* 声音状态 - 仅图片/虚拟人像显示（非关键帧/音频/视频） */}
        {!isKeyframe && asset.type !== "audio" && asset.type !== "video" && (
          <div className={cn(
            "flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px]",
            asset.bound_audio_id 
              ? "bg-primary/20 text-primary" 
              : "bg-muted-foreground/10 text-muted-foreground"
          )}>
            <Music className="w-2.5 h-2.5" />
            <span>{asset.bound_audio_id ? "有" : "无"}声</span>
          </div>
        )}
        {/* 音频时长 */}
        {asset.type === "audio" && asset.duration != null && (
          <div className="flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px] bg-violet-500/10 text-violet-600 dark:text-violet-400">
            <Music className="w-2.5 h-2.5" />
            <span>{Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, "0")}</span>
          </div>
        )}
        {/* 视频时长 */}
        {asset.type === "video" && asset.duration != null && (
          <div className="flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px] bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
            <Video className="w-2.5 h-2.5" />
            <span>{Math.floor(asset.duration / 60)}:{String(Math.floor(asset.duration % 60)).padStart(2, "0")}</span>
          </div>
        )}

        {/* 关键帧描述 - 仅关键帧显示，与美术资产的声音行高度对齐 */}
        {isKeyframe && (
          <p className="text-center text-[9px] text-muted-foreground/70 truncate" title={asset.keyframe_description || ""}>
            {asset.keyframe_description || "-"}
          </p>
        )}

        {/* 激活按钮 */}
        {showActivation && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleActivation?.();
            }}
            className={cn(
              "w-full flex items-center justify-center gap-0.5 py-0.5 rounded text-[9px] transition-all cursor-pointer",
              asset.isActivated 
                ? "bg-primary text-primary-foreground" 
                : "bg-muted-foreground/20 text-muted-foreground hover:bg-muted-foreground/30"
            )}
          >
            <span>激活</span>
            {asset.isActivated && <Check className="w-2.5 h-2.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

// 导出类型检查函数供外部使用
export { isKeyframeAsset };
