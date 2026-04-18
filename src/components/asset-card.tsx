"use client";

import { cn } from "@/lib/utils";
import { Image as ImageIcon, Music, X, Check, Scissors } from "lucide-react";
import type { Asset } from "@/lib/assets";

interface AssetCardProps {
  asset: Asset & { isActivated?: boolean };
  onClick?: () => void;
  onRemove?: () => void;
  onToggleActivation?: () => void;
  showRemove?: boolean;
  showActivation?: boolean;
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
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-20 cursor-pointer"
        >
          <X className={size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3"} />
        </button>
      )}

      {/* 类型标签 */}
      {isKeyframe && (
        <div className="absolute top-1 left-1 bg-primary text-primary-foreground text-[8px] px-1 py-0.5 rounded flex items-center gap-0.5 z-10">
          <Scissors className="w-2.5 h-2.5" />
          <span>关键帧</span>
        </div>
      )}

      {/* 图片/缩略图 */}
      {asset.thumbnail_url || asset.url ? (
        <div className={cn("w-full flex items-center justify-center bg-muted", size === "sm" ? "aspect-square" : "aspect-video")}>
          <img
            src={asset.thumbnail_url || asset.url}
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
        {/* 声音状态 - 仅美术资产显示 */}
        {!isKeyframe && (
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

        {/* 激活按钮 */}
        {showActivation && (
          <button
            onMouseDown={(e) => e.stopPropagation()}
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
