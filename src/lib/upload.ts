/**
 * 上传工具函数
 * 统一处理文件上传，包含用户 TOS 配置
 */

import { useSettingsStore } from "./settings";

export interface UploadOptions {
  projectId: string;
  type: "image" | "audio" | "video" | "keyframe";
  /** 如果为 true，只上传文件不创建数据库记录（用于缩略图等辅助文件） */
  skipDb?: boolean;
}

/**
 * 上传文件到服务器
 */
export async function uploadFile(
  file: File,
  options: UploadOptions
): Promise<{ url: string; storageKey: string; id?: string }> {
  const { tosSettings, tosEnabled } = useSettingsStore.getState();
  
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectId", options.projectId);
  formData.append("type", options.type);
  
  // 缩略图等辅助文件不需要创建数据库记录
  if (options.skipDb) {
    formData.append("skipDb", "true");
  }
  
  // 如果启用了用户 TOS 配置，添加到表单
  if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey && 
      tosSettings.secretKey && tosSettings.bucket) {
    formData.append("tosConfig", JSON.stringify(tosSettings));
  }
  
  const response = await fetch("/api/assets/upload", {
    method: "POST",
    body: formData,
  });
  
  if (!response.ok) {
    let errorMsg = "上传失败";
    try {
      const error = await response.json();
      errorMsg = error.error || errorMsg;
    } catch {
      errorMsg = response.statusText || errorMsg;
    }
    throw new Error(errorMsg);
  }
  
  const result = await response.json();
  return {
    url: result.url,
    storageKey: result.storageKey,
    id: result.id,
  };
}

/**
 * 判断 URL 是否为临时预签名 URL（会过期）
 * 火山方舟等平台返回的 URL 包含签名参数，通常 12 小时过期
 */
export function isTemporarySignedUrl(url: string): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    // 火山方舟 TOS 预签名 URL 特征
    if (
      parsed.hostname.includes("tos-cn-") ||
      parsed.hostname.includes("ark-media-asset")
    ) {
      if (parsed.searchParams.has("X-Tos-Algorithm") ||
          parsed.searchParams.has("X-Tos-Signature") ||
          parsed.searchParams.has("X-Tos-Credential")) {
        return true;
      }
    }
    // 通用签名特征（AWS S3 风格）
    if (parsed.searchParams.has("X-Amz-Signature") ||
        parsed.searchParams.has("Signature") ||
        parsed.searchParams.has("sign")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * 将临时 URL 的图片转存到自有 TOS，获取永久 URL
 * 如果 URL 不是临时签名 URL，直接返回原 URL
 */
export async function transferUrlIfTemporary(
  url: string,
  projectId: string
): Promise<string> {
  if (!url || !isTemporarySignedUrl(url)) {
    return url; // 非临时 URL，直接返回
  }

  const { tosSettings, tosEnabled } = useSettingsStore.getState();
  const tosConfig = tosEnabled && tosSettings.endpoint ? tosSettings : undefined;

  try {
    console.log("[Upload] Transferring temporary URL to permanent storage...");
    const response = await fetch("/api/assets/transfer-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, projectId, tosConfig }),
    });

    if (!response.ok) {
      console.warn("[Upload] Transfer failed, keeping original URL");
      return url;
    }

    const result = await response.json();
    console.log("[Upload] Transfer successful:", result.url.substring(0, 80) + "...");
    return result.url;
  } catch (error) {
    console.warn("[Upload] Transfer error, keeping original URL:", error);
    return url;
  }
}
