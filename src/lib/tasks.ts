// 任务相关的 API 调用

// 任务状态类型（包含 pending 状态）
export type TaskStatus = "pending" | "queued" | "running" | "succeeded" | "failed";

// 提示词框类型
export interface PromptBox {
  id: string;
  content: string;
  is_activated: boolean;
  activated_asset_id?: string;
  keyframe_description?: string;
  order: number;
}

// 任务参数类型（与前端 GeneratorParams 一致）
export interface TaskParams {
  duration: number;
  ratio: string;
  resolution: string;
  return_last_frame?: boolean;
  tools?: Array<{ type: "web_search" }>;
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
  // 持久化视频存储
  permanent_video_url?: string; // 永久可用的视频 URL
  video_storage_key?: string; // TOS 存储路径
  created_at: string;
  updated_at: string;
}

/**
 * 获取视频 URL，优先使用持久化的永久 URL
 */
export function getVideoUrl(task: Task): string | null {
  // 优先使用持久化的永久 URL
  if (task.permanent_video_url) {
    return task.permanent_video_url;
  }
  // 降级使用原始 URL
  return task.result?.video_url || null;
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
export async function getTask(id: string, apiKey?: string): Promise<Task | null> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-ark-api-key"] = apiKey;
  }
  
  const response = await fetch(`/api/tasks/${id}`, { headers });
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
  model_id?: string;
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
    // 尝试解析 JSON 错误，如果失败则使用状态文本
    let errorMessage = "Failed to create task";
    try {
      const error = await response.json();
      errorMessage = error.error || errorMessage;
    } catch {
      // 响应不是 JSON，使用状态文本
      errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    }
    throw new Error(errorMessage);
  }
  return response.json();
}

// 删除任务（调用 Seedance API 取消/删除任务）
export async function deleteTask(id: string, taskIdExternal?: string): Promise<void> {
  // 如果有外部任务 ID，先调用 Seedance API 删除
  if (taskIdExternal) {
    const response = await fetch(`/api/seedance/tasks?id=${taskIdExternal}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok && response.status !== 204) {
      // 忽略 404 等错误，继续删除本地记录
      console.warn("[deleteTask] Seedance API delete failed:", response.status);
    }
  }

  // 删除本地任务记录
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
  maxAttempts = 200,
  apiKey?: string
): Promise<Task> {
  let attempts = 0;

  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const task = await getTask(id, apiKey);
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
