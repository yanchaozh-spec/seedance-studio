// 全局虚拟人像库的 API 调用

export interface GlobalAvatar {
  id: string;
  asset_id: string;
  thumbnail_url: string | null;
  description: string;
  source_project_id: string | null;
  created_at: string;
  updated_at: string;
}

// 获取所有全局虚拟人像
export async function getGlobalAvatars(): Promise<GlobalAvatar[]> {
  const response = await fetch("/api/global-avatars");
  if (!response.ok) {
    throw new Error("Failed to fetch global avatars");
  }
  return response.json();
}

// 添加全局虚拟人像（如果 asset_id 已存在则更新）
export async function addGlobalAvatar(data: {
  asset_id: string;
  thumbnail_url?: string;
  description?: string;
  source_project_id?: string;
}): Promise<GlobalAvatar> {
  const response = await fetch("/api/global-avatars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to add global avatar");
  }
  return response.json();
}

// 删除全局虚拟人像
export async function deleteGlobalAvatar(id: string): Promise<void> {
  const response = await fetch(`/api/global-avatars/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete global avatar");
  }
}
