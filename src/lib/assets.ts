// 素材相关的 API 调用

export interface Asset {
  id: string;
  project_id: string;
  name: string;
  display_name?: string;
  type: "image" | "audio";
  url: string;
  thumbnail_url?: string;
  bound_audio_id?: string;
  size?: number;
  duration?: number;
  voice_description?: string;
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

// 删除素材
export async function deleteAsset(id: string): Promise<void> {
  const response = await fetch(`/api/assets/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete asset");
  }
}

// 更新素材（绑定音频等）
export async function updateAsset(id: string, updates: Partial<Asset>): Promise<Asset> {
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
export async function bindAudioToImage(imageId: string, audioId: string, voiceDescription?: string): Promise<Asset> {
  return updateAsset(imageId, {
    bound_audio_id: audioId,
    voice_description: voiceDescription,
  });
}

// 解除音频绑定
export async function unbindAudio(imageId: string): Promise<Asset> {
  return updateAsset(imageId, {
    bound_audio_id: undefined,
    voice_description: undefined,
  });
}

// 创建素材（上传文件后调用）
export async function createAsset(asset: Omit<Asset, "id" | "created_at">): Promise<Asset> {
  // 先通过上传 API 获取 URL
  const formData = new FormData();
  const file = await fetch(asset.url).then(r => r.blob());
  const blob = new File([file], asset.name, { type: asset.type === "image" ? "image/png" : "audio/mpeg" });
  formData.append("file", blob);
  formData.append("projectId", asset.project_id);
  formData.append("type", asset.type);

  const uploadResponse = await fetch("/api/assets/upload", {
    method: "POST",
    body: formData,
  });

  if (!uploadResponse.ok) {
    throw new Error("Failed to upload asset");
  }

  const { url: uploadedUrl, thumbnailUrl } = await uploadResponse.json();

  // 创建素材记录
  const response = await fetch(`/api/projects/${asset.project_id}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...asset,
      url: uploadedUrl,
      thumbnail_url: thumbnailUrl,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to create asset");
  }
  return response.json();
}

// 简化版创建素材（已有 URL）
export async function createAssetFromUrl(assetData: {
  project_id: string;
  name: string;
  type: "image" | "audio";
  url: string;
  thumbnail_url?: string;
  size?: number;
  duration?: number;
}): Promise<Asset> {
  const response = await fetch(`/api/projects/${assetData.project_id}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(assetData),
  });
  if (!response.ok) {
    throw new Error("Failed to create asset");
  }
  return response.json();
}
