// 任务相关的 API 调用

// 任务状态类型（包含 pending 状态）
export type TaskStatus = "pending" | "queued" | "running" | "succeeded" | "failed";

export interface PromptBox {
  id: string;
  content: string;
  is_activated: boolean;
  activated_asset_id?: string;
  order: number;
}

export interface TaskParams {
  duration: number;
  ratio: string;
  resolution: string;
}

export interface TaskResult {
  video_url: string;
  resolution: string;
  duration: number;
  last_frame_url?: string;
}

export interface Task {
  id: string;
  project_id: string;
  status: TaskStatus;
  progress: number;
  prompt_boxes: PromptBox[];
  selected_assets: string[];
  params: TaskParams;
  result?: TaskResult;
  error_message?: string;
  // 新增字段：任务追踪和统计
  task_id_external?: string; // 外部任务ID（用于轮询）
  completion_tokens?: number; // 消耗的 Token 数
  total_tokens?: number; // 总 Token 数
  queued_at?: string; // 进入队列时间
  started_at?: string; // 开始执行时间
  completed_at?: string; // 完成时间
  queue_duration?: number; // 排队时长（秒）
  generation_duration?: number; // 生成时长（秒）
  created_at: string;
  updated_at: string;
}

// 获取项目的所有任务
export async function getTasks(projectId: string): Promise<Task[]> {
  const response = await fetch(`/api/projects/${projectId}/tasks`);
  if (!response.ok) {
    throw new Error("Failed to fetch tasks");
  }
  return response.json();
}

// 获取单个任务
export async function getTask(id: string): Promise<Task | null> {
  const response = await fetch(`/api/tasks/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch task");
  }
  const data = await response.json();
  return data || null;
}

// 创建任务
export async function createTask(task: {
  project_id: string;
  prompt_boxes: PromptBox[];
  selected_assets: string[];
  params: TaskParams;
}, apiKey?: string): Promise<{ id: string; model?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-ark-api-key"] = apiKey;
  }
  
  const response = await fetch("/api/seedance/tasks", {
    method: "POST",
    headers,
    body: JSON.stringify(task),
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create task");
  }
  return response.json();
}

// 删除任务
export async function deleteTask(id: string): Promise<void> {
  const response = await fetch(`/api/tasks/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error("Failed to delete task");
  }
}

// 轮询任务状态
export async function pollTaskStatus(
  id: string,
  callback?: (task: Task) => void,
  interval = 3000,
  maxAttempts = 200
): Promise<Task> {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const task = await getTask(id);
        if (!task) {
          reject(new Error("任务不存在"));
          return;
        }

        callback?.(task);

        if (task.status === "succeeded" || task.status === "failed") {
          resolve(task);
          return;
        }

        attempts++;
        if (attempts >= maxAttempts) {
          reject(new Error("任务轮询超时"));
          return;
        }

        setTimeout(poll, interval);
      } catch (error) {
        reject(error);
      }
    };

    poll();
  });
}
