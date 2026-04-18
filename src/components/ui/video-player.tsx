"use client";

import { forwardRef, VideoHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface VideoPlayerProps extends Omit<VideoHTMLAttributes<HTMLVideoElement>, "className" | "src"> {
  src?: string | null;
  className?: string;
}

/**
 * 自适应视频播放器组件
 *
 * 容器始终 16:9，视频内容 object-contain 保持原始比例：
 * - 16:9 横屏视频：完美填充
 * - 9:16 竖屏视频：左右留黑边
 * - 播放控件始终可见，布局一致
 */
export const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  function VideoPlayer(
    { src, className, controls = true, style, ...props },
    ref
  ) {
    return (
      <div className={cn("relative aspect-video bg-black overflow-hidden", className)}>
        <video
          ref={ref}
          src={src || ""}
          controls={controls}
          className="absolute inset-0 w-full h-full object-contain"
          style={style}
          {...props}
        />
      </div>
    );
  }
);
