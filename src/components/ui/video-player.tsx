"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps {
  src: string | null;
  className?: string;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  poster?: string;
  controls?: boolean;
  [key: string]: unknown;
}

/**
 * 自适应视频播放器组件
 * - 使用 object-fit: contain 保持视频原始比例
 * - 自动计算最大尺寸，9:16 竖屏视频不会被放大
 */
export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer(
    {
      src,
      className,
      autoPlay = false,
      muted = false,
      loop = false,
      poster,
      controls = true,
      ...props
    },
    ref
  ) {
    return (
      <video
        ref={ref}
        src={src || ""}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        poster={poster}
        controls={controls}
        className={cn(
          // 核心样式：保持原始比例，不变形放大
          "max-w-full max-h-full",
          // 默认居中显示
          "mx-auto",
          // object-fit: contain 保持原始比例，整个视频可见
          "object-contain",
          // 黑色背景（视频周围可能有黑边）
          "bg-black",
          className
        )}
        {...props}
      />
    );
  }
);

/**
 * 固定宽高比的视频播放器
 * 适用于需要固定容器大小的场景（如卡片预览）
 */
interface AspectVideoPlayerProps {
  src: string | null;
  className?: string;
  aspectRatio?: "16:9" | "9:16" | "1:1" | "auto";
  poster?: string;
  muted?: boolean;
  [key: string]: unknown;
}

export function AspectVideoPlayer({
  src,
  className,
  aspectRatio = "16:9",
  poster,
  muted = false,
  ...props
}: AspectVideoPlayerProps) {
  const aspectClass = {
    "16:9": "aspect-video",
    "9:16": "aspect-[9/16]",
    "1:1": "aspect-square",
    "auto": "",
  }[aspectRatio];

  return (
    <div className={cn("relative bg-black overflow-hidden", aspectClass, className)}>
      <VideoPlayer
        src={src}
        poster={poster}
        muted={muted}
        className="absolute inset-0 w-full h-full"
        {...props}
      />
    </div>
  );
}
