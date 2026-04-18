// 素材相关的 API 调用

import { useSettingsStore } from "./settings";

export type AssetType = "image" | "audio" | "keyframe";

// 资产类别：关键帧（用于提示词拼接）| 美术资产（普通图片）
export type AssetCategory = "keyframe" | "image";

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  display_name?: string;
  type: AssetType;
  asset_category?: AssetCategory; // 'keyframe' | 'image'
  keyframe_description?: string;
  keyframe_source_task_id?: string;
  bound_audio_id?: string; // 绑定的音频素材ID
  url: string;
  thumbnail_url?: string;
  size?: number;
  duration?: number; // 音频时长（秒）
  created_at: string;
}

// 获取项目的所有素材
export async function getAssets(projectId: string): Promise<Asset[]> {
  const response = await fetch(`/api/projects/${projectId}/assets`);
  if (!response.ok) {
    throw new Error("Failed to fetch assets");
  }
  return response.json();
}

// 获取单个素材
export async function getAsset(id: string): Promise<Asset | null> {
  const response = await fetch(`/api/assets/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch asset");
  }
  const data = await response.json();
  return data || null;
}

// 创建素材记录
export async function createAssetFromUrl(params: {
  project_id: string;
  name: string;
  type: AssetType;
  asset_category?: AssetCategory;
  url: string;
  thumbnail_url?: string;
  size?: number;
}): Promise<Asset> {
  const response = await fetch(`/api/projects/${params.project_id}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: params.name,
      type: params.type,
      asset_category: params.asset_category,
      url: params.url,
      thumbnail_url: params.thumbnail_url,
      size: params.size,
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to create asset");
  }
  return response.json();
}

// 删除素材
export async function deleteAsset(id: string): Promise<void> {
  const response = await fetch(`/api/assets/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete asset");
  }
}

// 更新素材类别和描述
export async function updateAsset(id: string, updates: {
  asset_category?: AssetCategory;
  keyframe_description?: string;
  display_name?: string;
}): Promise<Asset> {
  const response = await fetch(`/api/assets/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  if (!response.ok) {
    throw new Error("Failed to update asset");
  }
  return response.json();
}

// 绑定音频到图片
export async function bindAudioToImage(imageId: string, audioId: string): Promise<void> {
  const response = await fetch(`/api/assets/${imageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bound_audio_id: audioId }),
  });
  if (!response.ok) {
    throw new Error("Failed to bind audio");
  }
}

// 解除音频绑定
export async function unbindAudio(imageId: string): Promise<void> {
  const response = await fetch(`/api/assets/${imageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bound_audio_id: null }),
  });
  if (!response.ok) {
    throw new Error("Failed to unbind audio");
  }
}

// 从视频提取帧并保存为素材
export async function extractFrameFromVideo(params: {
  projectId: string;
  taskId?: string;
  timestamp: number; // 时间点（秒）
  assetCategory?: "keyframe" | "image";
  name?: string;
}): Promise<{ success: boolean; asset: Asset; url: string }> {
  // 返回一个需要前端提供 canvas 截图的函数
  // 使用方式：先调用此函数获取配置，然后在 canvas 上绘制视频帧并调用返回的提交函数
  const { projectId, taskId, timestamp, assetCategory = "image", name } = params;

  return new Promise((resolve, reject) => {
    // 返回一个闭包，让调用者获取提交函数
    const submitFrame = async (canvas: HTMLCanvasElement) => {
      return new Promise<void>((res, rej) => {
        canvas.toBlob(async (blob) => {
          if (!blob) {
            rej(new Error("Failed to capture frame"));
            return;
          }

          try {
            const formData = new FormData();
            formData.append("file", new File([blob], "frame.png", { type: "image/png" }));
            formData.append("projectId", projectId);
            formData.append("taskId", taskId || "");
            formData.append("timestamp", timestamp.toString());
            formData.append("assetCategory", assetCategory);
            formData.append("name", name || `frame-${Date.now()}`);

            // 添加 TOS 配置到 FormData
            const { tosEnabled, tosSettings } = useSettingsStore.getState();
            if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey) {
              formData.append("tos_config", JSON.stringify(tosSettings));
            }

            const response = await fetch("/api/assets/extract-frame", {
              method: "POST",
              body: formData,
            });

            if (!response.ok) {
              const error = await response.json();
              rej(new Error(error.error || "Failed to extract frame"));
              return;
            }

            const result = await response.json();
            resolve(result);
          } catch (error) {
            rej(error);
          }
        }, "image/png");
      });
    };

    // 返回一个对象包含配置和提交函数
    resolve({
      success: true,
      asset: null as unknown as Asset,
      url: "",
      // @ts-expect-error - 返回提交函数
      submitFrame,
    });
  });
}

// 简化版：从 canvas 直接提交帧
export async function submitFrameFromCanvas(
  canvas: HTMLCanvasElement,
  projectId: string,
  options?: {
    taskId?: string;
    timestamp?: number;
    assetCategory?: "keyframe" | "image";
    name?: string;
  }
): Promise<{ success: boolean; asset: Asset; url: string }> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          // blob 为 null 表示 canvas 被污染
          reject(new Error("Canvas is tainted (cross-origin content)"));
          return;
        }

        try {
          const formData = new FormData();
          formData.append("file", new File([blob], "frame.png", { type: "image/png" }));
          formData.append("projectId", projectId);
          formData.append("taskId", options?.taskId || "");
          formData.append("timestamp", (options?.timestamp || 0).toString());
          formData.append("assetCategory", options?.assetCategory || "image");
          formData.append("name", options?.name || `frame-${Date.now()}`);

          // 添加 TOS 配置到 FormData
          const { tosEnabled, tosSettings } = useSettingsStore.getState();
          console.log("[submitFrameFromCanvas] tosEnabled:", tosEnabled, "tosSettings:", JSON.stringify(tosSettings));
          if (tosEnabled && tosSettings.endpoint && tosSettings.accessKey) {
            formData.append("tos_config", JSON.stringify(tosSettings));
            console.log("[submitFrameFromCanvas] Added tos_config to FormData");
          } else {
            console.log("[submitFrameFromCanvas] TOS not enabled or config incomplete");
          }

          const response = await fetch("/api/assets/extract-frame", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            reject(new Error(error.error || "Failed to extract frame"));
            return;
          }

          const result = await response.json();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      }, "image/png");
    } catch (error) {
      // canvas.toBlob 本身抛出错误（通常是跨域污染）
      reject(new Error("Canvas is tainted (cross-origin content)"));
    }
  });
}
