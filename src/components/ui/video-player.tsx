"use client";

import { forwardRef, VideoHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "className" | "src"> {
  src?: string | null;
  className?: string;
}

/**
 * 自适应视频播放器组件
 * - 使用 object-fit: contain 保持视频原始比例
 * - 9:16 竖屏视频不会被放大，上下留黑边
 * - 播放按钮和控件与原生 video 一致
 */
export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer(
    { src, className, controls = true, style, ...props },
    ref
  ) {
    return (
      <video
        ref={ref}
        src={src || ""}
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
        style={style}
        {...props}
      />
    );
  }
);
