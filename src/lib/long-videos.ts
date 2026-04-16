// 长视频任务相关的 API 调用

export type LongVideoStatus =
  | "pending"
  | "generating"
  | "merging"
  | "succeeded"
  | "failed";

export interface VideoSegment {
  id: string;
  long_video_id: string;
  segment_index: number;
  task_id?: string;
  status: "pending" | "queued" | "running" | "succeeded" | "failed";
  video_url?: string;
  last_frame_url?: string;
  prompt_content?: {
    id: string;
    content: string;
    is_activated: boolean;
    activated_asset_id?: string;
    keyframe_description?: string;
    order: number;
  };
  first_frame_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface LongVideo {
  id: string;
  project_id: string;
  status: LongVideoStatus;
  progress: number;
  total_segments: number;
  completed_segments: number;
  final_video_url?: string;
  final_video_duration?: number;
  target_duration: number;
  prompts: Array<{
    id: string;
    content: string;
    is_activated: boolean;
    activated_asset_id?: string;
    keyframe_description?: string;
    order: number;
  }>;
  selected_assets: string[];
  params: {
    ratio: string;
    resolution: string;
    generate_audio: boolean;
  };
  error_message?: string;
  created_at: string;
  updated_at: string;
  segments?: VideoSegment[];
}

export interface CreateLongVideoParams {
  project_id: string;
  prompts: Array<{
    id: string;
    content: string;
    is_activated: boolean;
    activated_asset_id?: string;
    keyframe_description?: string;
    order: number;
  }>;
  selected_assets: string[];
  params: {
    target_duration: number;
    ratio: string;
    resolution: string;
    generate_audio: boolean;
  };
}

// 创建长视频任务
export async function createLongVideo(
  params: CreateLongVideoParams,
  apiKey?: string
): Promise<{ id: string; status: string; total_segments: number; target_duration: number }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-ark-api-key"] = apiKey;
  }

  const response = await fetch("/api/long-videos", {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create long video");
  }

  return response.json();
}

// 获取长视频详情
export async function getLongVideo(id: string): Promise<LongVideo | null> {
  const response = await fetch(`/api/long-videos/${id}`);
  if (!response.ok) {
    throw new Error("Failed to fetch long video");
  }
  return response.json();
}

// 获取项目的所有长视频
export async function getLongVideos(projectId: string): Promise<LongVideo[]> {
  const response = await fetch(`/api/long-videos?project_id=${projectId}`);
  if (!response.ok) {
    throw new Error("Failed to fetch long videos");
  }
  return response.json();
}

// 取消长视频任务
export async function cancelLongVideo(id: string): Promise<void> {
  const response = await fetch(`/api/long-videos/${id}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to cancel long video");
  }
}

// 轮询长视频状态
export async function pollLongVideoStatus(
  id: string,
  callback?: (video: LongVideo) => void,
  interval = 3000,
  maxAttempts = 600 // 最多 30 分钟（600 * 3s）
): Promise<LongVideo> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    const video = await getLongVideo(id);

    if (!video) {
      throw new Error("Long video not found");
    }

    // 调用回调
    if (callback) {
      callback(video);
    }

    // 如果任务完成或失败，停止轮询
    if (video.status === "succeeded" || video.status === "failed") {
      return video;
    }

    // 等待后再检查
    await new Promise((resolve) => setTimeout(resolve, interval));
    attempts++;
  }

  // 超时，返回当前状态
  const finalVideo = await getLongVideo(id);
  if (!finalVideo) {
    throw new Error("Long video not found");
  }
  return finalVideo;
}
