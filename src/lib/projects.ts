// 项目相关的 API 调用

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

// 获取所有项目
export async function getProjects(): Promise<Project[]> {
  const response = await fetch("/api/projects");
  if (!response.ok) {
    throw new Error("Failed to fetch projects");
  }
  return response.json();
}

// 获取单个项目
export async function getProject(id: string): Promise<Project | null> {
  const response = await fetch(`/api/projects/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch project");
  }
  const data = await response.json();
  return data || null;
}

// 创建项目
export async function createProject(name: string): Promise<Project> {
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Failed to create project");
  }
  return response.json();
}

// 删除项目
export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete project");
  }
}

// 重命名项目
export async function renameProject(id: string, name: string): Promise<Project> {
  const response = await fetch(`/api/projects/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Failed to rename project");
  }
  return response.json();
}

// 获取项目任务数量
export async function getProjectTaskCount(projectId: string): Promise<number> {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) {
    throw new Error("Failed to fetch task count");
  }
  const tasks = await response.json();
  return Array.isArray(tasks) ? tasks.length : 0;
}

// 推送项目到云端
export async function pushProjectToCloud(projectId: string, tosConfig: unknown): Promise<{
  success: boolean;
  key: string;
  assetCount: number;
  taskCount: number;
}> {
  const response = await fetch("/api/projects/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, tosConfig }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "推送失败");
  }
  return response.json();
}

// 获取云端项目列表
export async function getCloudProjects(tosConfig: unknown): Promise<{
  projects: {
    slug: string;
    name: string;
    exportedAt: string;
    assetCount: number;
    taskCount: number;
    key: string;
    isLocal: boolean;
  }[];
}> {
  const response = await fetch(`/api/projects/sync?tosConfig=${encodeURIComponent(JSON.stringify(tosConfig))}`);
  if (!response.ok) {
    throw new Error("获取云端项目失败");
  }
  return response.json();
}

// 从云端拉取项目
export async function pullProjectFromCloud(key: string, tosConfig: unknown): Promise<{
  success: boolean;
  project: { id: string; name: string; slug: string };
  importedAssets: number;
  importedTasks: number;
}> {
  const response = await fetch("/api/projects/sync", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, tosConfig }),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "拉取失败");
  }
  return response.json();
}
