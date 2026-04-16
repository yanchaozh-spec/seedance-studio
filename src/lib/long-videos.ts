// 长视频任务相关的 API 调用

export type LongVideoStatus =
  | "pending"
  | "generating"
  | "waiting_merge"
  | "merging"
  | "completed"
  | "failed";

export type SegmentStatus =
  | "pending"
  | "queued"
  | "running"
  | "waiting_confirm"
  | "confirmed"
  | "failed";

// 单个分段的提示词配置
export interface SegmentPrompt {
  id: string;
  content: string;
  isActivated: boolean;
  activatedAssetId?: string;
  keyframeDescription?: string;
  order: number;
}

// 单个分段的配置
export interface SegmentConfig {
  id?: string;
  segmentIndex?: number;
  // 提示词配置
  prompts: SegmentPrompt[];
  // 选中的素材
  selectedAssets: string[];
  // 生成参数
  duration: number;           // 时长 (4-15秒)
  ratio: string;              // 16:9/9:16/1:1/adaptive
  resolution: string;         // 480p/720p
  generateAudio: boolean;      // 是否生成音频
}

// 单个分段
export interface VideoSegment {
  id: string;
  long_video_id: string;
  segment_index: number;
  task_id?: string;
  status: SegmentStatus;
  video_url?: string;
  last_frame_url?: string;
  // 每段独立的配置
  prompt_content?: SegmentPrompt[];
  asset_ids?: string[];
  segment_duration?: number;
  segment_ratio?: string;
  segment_resolution?: string;
  segment_generate_audio?: boolean;
  // 上一段尾帧作为本段首帧
  first_frame_url?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

// 长视频任务
export interface LongVideo {
  id: string;
  project_id: string;
  status: LongVideoStatus;
  progress: number;
  completed_segments: number;
  total_segments?: number;
  final_video_url?: string;
  final_video_duration?: number;
  merge_task_id?: string;
  error_message?: string;
  created_at: string;
  updated_at: string;
  segments?: VideoSegment[];
}

// 创建长视频项目（不生成视频）
export interface CreateLongVideoProjectParams {
  project_id: string;
  segments: Omit<SegmentConfig, 'id'>[];
}

// 兼容旧的创建长视频参数
export interface LegacyCreateLongVideoParams {
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

// 兼容旧的 createLongVideo 函数
export async function createLongVideo(
  params: LegacyCreateLongVideoParams,
  apiKey?: string
): Promise<{ id: string; total_segments: number; target_duration: number }> {
  // 计算分段数（每段最长15秒）
  const SEGMENT_DURATION = 15;
  const totalSegments = Math.ceil(params.params.target_duration / SEGMENT_DURATION);

  // 将旧格式的 prompts 转换为新格式
  const convertPrompt = (p: LegacyCreateLongVideoParams['prompts'][number]): SegmentPrompt => ({
    id: p.id,
    content: p.content,
    isActivated: p.is_activated,
    activatedAssetId: p.activated_asset_id,
    keyframeDescription: p.keyframe_description,
    order: p.order,
  });

  // 调用新的 API
  const segments = Array.from({ length: totalSegments }, (_, i) => ({
    prompts: [convertPrompt(params.prompts[i] || params.prompts[0] || { id: String(i), content: "", is_activated: true, order: 0 })],
    selectedAssets: params.selected_assets,
    duration: SEGMENT_DURATION,
    ratio: params.params.ratio,
    resolution: params.params.resolution,
    generateAudio: params.params.generate_audio,
  }));

  // 最后一节使用实际剩余时长
  const lastSegmentDuration = params.params.target_duration % SEGMENT_DURATION || SEGMENT_DURATION;
  if (segments.length > 0) {
    segments[segments.length - 1].duration = lastSegmentDuration;
  }

  const result = await createLongVideoProject({
    project_id: params.project_id,
    segments,
  });

  return {
    id: result.id,
    total_segments: totalSegments,
    target_duration: params.params.target_duration,
  };
}

// 生成单个分段
export interface GenerateSegmentParams {
  segment_id: string;
  first_frame_url?: string; // 可选的首帧图片
}

// 确认分段，准备生成下一段
export interface ConfirmSegmentParams {
  segment_id: string;
  next_prompts?: SegmentPrompt[];
  next_selected_assets?: string[];
  next_duration?: number;
  next_ratio?: string;
  next_resolution?: string;
  next_generate_audio?: boolean;
}

// 创建长视频项目（不生成视频）
export async function createLongVideoProject(
  params: CreateLongVideoProjectParams
): Promise<{ id: string; segments: VideoSegment[] }> {
  const response = await fetch("/api/long-videos/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to create long video project");
  }

  return response.json();
}

// 生成单个分段
export async function generateSegment(
  params: GenerateSegmentParams,
  apiKey?: string
): Promise<{ segment_id: string; task_id: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-ark-api-key"] = apiKey;
  }

  const response = await fetch("/api/long-videos/segments/generate", {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to generate segment");
  }

  return response.json();
}

// 确认分段，使用尾帧作为下一段首帧
export async function confirmSegment(
  segmentId: string
): Promise<{ long_video: LongVideo; segments: VideoSegment[] }> {
  const response = await fetch("/api/long-videos/segments/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segment_id: segmentId }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to confirm segment");
  }

  return response.json();
}

// 重新生成分段（不传递首帧）
export async function regenerateSegment(
  segmentId: string,
  apiKey?: string
): Promise<{ segment_id: string; task_id: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-ark-api-key"] = apiKey;
  }

  const response = await fetch(`/api/long-videos/segments/${segmentId}/regenerate`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to regenerate segment");
  }

  return response.json();
}

// 获取长视频详情
export async function getLongVideo(id: string): Promise<{ long_video: LongVideo; segments: VideoSegment[] } | null> {
  const response = await fetch(`/api/long-videos/${id}`);
  if (!response.ok) {
    return null;
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

// 轮询分段状态
export async function pollSegmentStatus(
  segmentId: string,
  callback?: (segment: VideoSegment) => void,
  interval = 3000,
  maxAttempts = 200
): Promise<VideoSegment> {
  while (true) {
    const videoData = await getLongVideoBySegment(segmentId);
    if (!videoData) {
      throw new Error("Long video not found");
    }

    const segment = videoData.segments?.find(s => s.id === segmentId);
    if (!segment) {
      throw new Error("Segment not found");
    }

    if (callback) {
      callback(segment);
    }

    if (segment.status === "waiting_confirm" || segment.status === "failed" || segment.status === "confirmed") {
      return segment;
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }
}

// 通过分段 ID 获取长视频信息
export async function getLongVideoBySegment(segmentId: string): Promise<{ long_video: LongVideo; segments: VideoSegment[] } | null> {
  const response = await fetch(`/api/long-videos/by-segment/${segmentId}`);
  if (!response.ok) {
    return null;
  }
  return response.json();
}

// 合并所有分段
export async function mergeSegments(
  longVideoId: string,
  apiKey?: string
): Promise<{ long_video_id: string; merge_task_id?: string; final_video_url?: string }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-ark-api-key"] = apiKey;
  }

  const response = await fetch(`/api/long-videos/${longVideoId}/merge`, {
    method: "POST",
    headers,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to merge segments");
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

// 更新分段配置
export async function updateSegmentConfig(
  segmentId: string,
  config: Partial<SegmentConfig>
): Promise<void> {
  const response = await fetch(`/api/long-videos/segments/${segmentId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to update segment config");
  }
}

// 添加新分段
export async function addSegment(
  longVideoId: string,
  config: Omit<SegmentConfig, 'id'>
): Promise<{ segment: VideoSegment; segments: VideoSegment[] }> {
  const response = await fetch(`/api/long-videos/${longVideoId}/segments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to add segment");
  }

  return response.json();
}

// 获取长视频的所有分段
export async function getSegments(
  longVideoId: string
): Promise<{ long_video: LongVideo; segments: VideoSegment[] }> {
  const response = await fetch(`/api/long-videos/${longVideoId}/segments`, {
    method: "GET",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to get segments");
  }

  return response.json();
}

// 删除分段
export async function deleteSegment(segmentId: string): Promise<{ deleted: boolean; segments?: VideoSegment[]; long_video_deleted?: boolean }> {
  const response = await fetch(`/api/long-videos/segments/${segmentId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to delete segment");
  }

  return response.json();
}
