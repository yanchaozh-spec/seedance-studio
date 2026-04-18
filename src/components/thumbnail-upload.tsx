"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Image, X, Upload } from "lucide-react";

interface ThumbnailUploadProps {
  /** 当前 URL 值 */
  url: string;
  onUrlChange: (url: string) => void;
  /** 本地预览 base64 */
  preview: string | null;
  onPreviewChange: (preview: string | null) => void;
  /** 本地文件 */
  file: File | null;
  onFileChange: (file: File | null) => void;
  /** 上传中状态 */
  uploading?: boolean;
  /** 提示文字 */
  hint?: string;
}

/**
 * 缩略图上传组件
 * 支持：本地上传（预览） + URL 输入，预览和清除
 */
export function ThumbnailUpload({
  url,
  onUrlChange,
  preview,
  onPreviewChange,
  file,
  onFileChange,
  uploading = false,
  hint = "缩略图仅用于预览显示，不发送给 API",
}: ThumbnailUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasImage = preview || url;

  const handleClear = () => {
    onUrlChange("");
    onPreviewChange(null);
    onFileChange(null);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onPreviewChange(ev.target?.result as string);
    };
    reader.readAsDataURL(selected);
    onFileChange(selected);
    // 重置 input，允许重复选择同一文件
    e.target.value = "";
  };

  return (
    <div className="space-y-2">
      {/* 预览区 */}
      {hasImage && (
        <div className="relative aspect-video bg-muted rounded-lg overflow-hidden">
          <img
            src={preview || url}
            alt="缩略图预览"
            className="w-full h-full object-contain"
          />
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1 right-1 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:opacity-80 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* 无图时：上传区 + URL 输入 */}
      {!hasImage && (
        <div className="space-y-2">
          {/* 本地上传按钮 */}
          <label className="flex items-center justify-center gap-1.5 h-9 border border-dashed border-muted-foreground/25 rounded-md cursor-pointer hover:bg-muted/50 transition-colors text-xs text-muted-foreground">
            {uploading ? (
              <span className="animate-pulse">上传中...</span>
            ) : (
              <>
                <Upload className="w-3.5 h-3.5" />
                <span>上传本地图片</span>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={handleFileSelect}
            />
          </label>
          {/* 分隔 */}
          <div className="flex items-center gap-2">
            <div className="flex-1 border-t border-muted-foreground/15" />
            <span className="text-[10px] text-muted-foreground/50">或</span>
            <div className="flex-1 border-t border-muted-foreground/15" />
          </div>
          {/* URL 输入 */}
          <Input
            placeholder="输入图片 URL"
            value={url}
            onChange={(e) => onUrlChange(e.target.value.trim())}
            className="text-xs"
          />
        </div>
      )}

      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
