/**
 * 上传工具函数
 * 统一处理文件上传，包含用户 TOS 配置
 */

import { useSettingsStore } from "./settings";

export interface UploadOptions {
  projectId: string;
  type: "image" | "audio" | "keyframe";
}

/**
 * 上传文件到服务器
 */
export async function uploadFile(
  file: File,
  options: UploadOptions
): Promise<{ url: string; storageKey: string }> {
  const { tosSettings, tosEnabled } = useSettingsStore.getState();
  
  const formData = new FormData();
  formData.append("file", file);
  formData.append("projectId", options.projectId);
  formData.append("type", options.type);
  
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
    const error = await response.json();
    throw new Error(error.error || "上传失败");
  }
  
  const result = await response.json();
  return {
    url: result.url,
    storageKey: result.storageKey,
  };
}
