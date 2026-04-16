// 项目相关的 API 调用

export interface Project {
  id: string;
  name: string;
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
