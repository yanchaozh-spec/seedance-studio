import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL_ID = process.env.ARK_MODEL_ID || "";

// 请求体类型
interface CreateTaskRequest {
  project_id: string;
  prompt_boxes: Array<{
    id: string;
    content: string;
    is_activated: boolean;
    activated_asset_id?: string;
    keyframe_description?: string;
    order: number;
  }>;
  selected_assets: string[];
  params: {
    duration: number;
    ratio: string;
    resolution: string;
  };
  model_id?: string; // 可选，由前端传入
}

// Content Item 类型定义 - 严格按照 API 文档格式
interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image_url";
  image_url: {
    url: string;
  };
  role?: "first_frame" | "last_frame" | "reference_image";
}

interface VideoContent {
  type: "video_url";
  video_url: {
    url: string;
  };
  role: "reference_video";
}

interface AudioContent {
  type: "audio_url";
  audio_url: {
    url: string;
  };
  role: "reference_audio";
}

type ContentItem = TextContent | ImageContent | VideoContent | AudioContent;

// 构建 content 数组 - 符合 Seedance 2.0 官方 API 格式
// 格式：素材定义行（使用URL） + 提示词分行
// 示例：林央：url1，声线为：audioUrl1；启龙：url2；花花：url3；关键帧描述：url4
function buildContent(
  promptBoxes: CreateTaskRequest["prompt_boxes"],
  assets: Array<{
    id: string;
    url: string;
    type: string;
    display_name?: string;
    name: string;
    asset_category?: string;
    bound_audio_id?: string;
    voice_description?: string;
    keyframe_description?: string;
    is_keyframe?: boolean;
  }>
): ContentItem[] {
  const content: ContentItem[] = [];

  // 分类素材
  const imageAssets = assets.filter((a) => a.type === "image" && a.asset_category !== "keyframe");
  const keyframeAssets = assets.filter((a) => a.type === "keyframe" || a.asset_category === "keyframe" || a.is_keyframe);
  const audioAssets = assets.filter((a) => a.type === "audio");

  // 按顺序收集所有图片（美术资产 + 关键帧）
  const allImageAssets: typeof imageAssets = [];
  allImageAssets.push(...imageAssets);
  allImageAssets.push(...keyframeAssets);

  // 构建素材定义行（使用 URL）
  // 格式：素材名1：url1，声线为：audioUrl1；素材名2：url2
  const assetRefParts: string[] = [];

  for (let i = 0; i < allImageAssets.length; i++) {
    const asset = allImageAssets[i];
    const displayName = asset.display_name || asset.name;
    const isKeyframe = asset.asset_category === "keyframe" || asset.type === "keyframe" || asset.is_keyframe;

    if (isKeyframe) {
      // 关键帧：使用 keyframe_description 或 name
      const desc = asset.keyframe_description || displayName;
      assetRefParts.push(`${desc}：${asset.url}`);
    } else {
      // 美术资产
      assetRefParts.push(`${displayName}：${asset.url}`);

      // 检查是否绑定音频
      if (asset.bound_audio_id) {
        const boundAudio = audioAssets.find((a) => a.id === asset.bound_audio_id);
        if (boundAudio) {
          assetRefParts[assetRefParts.length - 1] += `，声线为：${boundAudio.url}`;
        }
      }
    }
  }

  // 按顺序处理提示词框
  const sortedBoxes = promptBoxes
    .filter((box) => box.content.trim())
    .sort((a, b) => a.order - b.order);

  // 构建文本内容
  const textParts: string[] = [];

  // 第一行：素材定义（用分号隔开）
  const assetDefLine = assetRefParts.join("；");
  if (assetDefLine) {
    textParts.push(assetDefLine);
  }

  // 后续行：每个提示词框一行
  for (const box of sortedBoxes) {
    if (box.content.trim()) {
      textParts.push(box.content.trim());
    }
  }

  // 添加所有图片（使用 URL）
  for (let i = 0; i < allImageAssets.length; i++) {
    const asset = allImageAssets[i];
    const isKeyframe = asset.asset_category === "keyframe" || asset.type === "keyframe" || asset.is_keyframe;

    content.push({
      type: "image_url",
      image_url: {
        url: asset.url,
      },
      role: isKeyframe ? "first_frame" : "reference_image",
    });
  }

  // 添加合并的文本（只有一个 text 对象）
  if (textParts.length > 0) {
    content.push({
      type: "text",
      text: textParts.join("\n"),
    });
  }

  return content;
}

// 创建视频生成任务
export async function POST(request: NextRequest) {
  try {
    const body: CreateTaskRequest = await request.json();
    const { project_id, prompt_boxes, selected_assets, params } = body;

    // 获取 ARK API Key - 优先从请求头获取，其次从环境变量获取
    const apiKey = request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
    
    if (!apiKey) {
      console.error("[CREATE TASK] ARK API Key not configured");
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    // 获取选中的素材
    const client = getSupabaseClient();
    
    // 先获取选中的素材
    const { data: assets, error: assetsError } = await client
      .from("assets")
      .select("*")
      .in("id", selected_assets);

    if (assetsError) {
      return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
    }

    // 如果有图片绑定了音频，也需要获取这些音频素材
    let allAssets = assets || [];
    const boundAudioIds = assets
      ?.filter((a) => (a.type === "image" || a.type === "keyframe" || a.asset_category === "keyframe" || a.is_keyframe) && a.bound_audio_id)
      .map((a) => a.bound_audio_id)
      .filter((id): id is string => !!id) || [];
    
    if (boundAudioIds.length > 0) {
      const { data: boundAudios } = await client
        .from("assets")
        .select("*")
        .in("id", boundAudioIds);
      
      if (boundAudios && boundAudios.length > 0) {
        allAssets = [...allAssets, ...boundAudios.filter(b => !allAssets.some(a => a.id === b.id))];
      }
    }

    // 构建 content 数组
    const content = buildContent(prompt_boxes, allAssets);

    if (content.length === 0) {
      return NextResponse.json({ error: "No content to generate" }, { status: 400 });
    }

    // 使用前端传入的 model_id 或默认值
    const modelId = body.model_id || DEFAULT_MODEL_ID;

    // 构建请求参数 - 严格按照 API 文档格式
    const requestBody: Record<string, unknown> = {
      model: modelId,
      content,
      generate_audio: true,
      ratio: params.ratio,
      duration: params.duration,
      resolution: params.resolution,
      watermark: false,
      return_last_frame: true,
    };

    try {
      // 调用 Seedance API 获取 task ID
      const response = await fetch(`${ARK_API_URL}/contents/generations/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("[CREATE TASK] API error:", data);
        return NextResponse.json({ 
          error: data.error?.message || data.error?.code || "API request failed" 
        }, { status: response.status });
      }

      // 使用 API 返回的 task ID 保存任务到数据库
      const taskId = data.id;
      const { error: insertError } = await client.from("tasks").insert({
        id: taskId,
        project_id,
        task_id_external: taskId,
        status: "queued",
        model_mode: "standard",
        model_id: modelId,
        progress: 0,
        prompt_boxes,
        selected_assets,
        params,
        queued_at: new Date().toISOString(),
        api_key: apiKey, // 保存 API Key 用于轮询
      });

      if (insertError) {
        console.error("Failed to save task:", insertError);
        return NextResponse.json({ 
          error: "Failed to save task" 
        }, { status: 500 });
      }

      return NextResponse.json({
        id: taskId,
        status: "queued",
        model: modelId,
      });
    } catch (apiError) {
      console.error("API call failed:", apiError);
      throw apiError;
    }
  } catch (error) {
    console.error("Create task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 获取任务状态
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    const apiKey = request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    const response = await fetch(`${ARK_API_URL}/contents/generations/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ 
        error: data.error?.message || data.error?.code || "API request failed" 
      }, { status: response.status });
    }

    // 更新数据库中的任务状态
    const client = getSupabaseClient();
    
    const updateData: Record<string, unknown> = {
      status: data.status,
      progress: data.status === "running" ? 50 : data.status === "succeeded" ? 100 : 0,
    };

    // 记录时间戳
    if (data.status === "running" || data.status === "succeeded") {
      updateData.started_at = new Date(data.updated_at * 1000).toISOString();
    }
    
    if (data.status === "succeeded") {
      updateData.completed_at = new Date(data.updated_at * 1000).toISOString();
      updateData.result = {
        video_url: data.content?.video_url,
        resolution: data.resolution,
        duration: data.duration,
        last_frame_url: data.content?.last_frame_url,
      };
    }
    
    if (data.status === "failed") {
      updateData.completed_at = new Date(data.updated_at * 1000).toISOString();
      updateData.error_message = data.error?.message || "Generation failed";
    }

    // Token 消耗统计
    if (data.usage) {
      updateData.completion_tokens = data.usage.completion_tokens;
      updateData.total_tokens = data.usage.total_tokens;
    }

    // 计算耗时
    const task = await client.from("tasks").select("*").eq("id", taskId).single();
    if (task.data) {
      const queuedAt = task.data.queued_at ? new Date(task.data.queued_at).getTime() : 0;
      const startedAt = updateData.started_at ? new Date(updateData.started_at as string).getTime() : 0;
      const completedAt = updateData.completed_at ? new Date(updateData.completed_at as string).getTime() : Date.now();
      
      if (queuedAt && startedAt) {
        updateData.queue_duration = Math.round((startedAt - queuedAt) / 1000);
      }
      if (startedAt) {
        updateData.generation_duration = Math.round((completedAt - startedAt) / 1000);
      }
    }

    await client.from("tasks").update(updateData).eq("id", taskId);

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: updateData.progress,
      result: updateData.result,
      error_message: updateData.error_message,
      completion_tokens: updateData.completion_tokens,
      total_tokens: updateData.total_tokens,
      queue_duration: updateData.queue_duration,
      generation_duration: updateData.generation_duration,
    });
  } catch (error) {
    console.error("Get task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
