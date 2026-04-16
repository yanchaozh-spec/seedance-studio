// 素材相关的 API 调用

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
