import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";

// 固定使用自定义推理节点接入点 ID
const MODEL_ID = "ep-m-20260417004442-42dzs";

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

type ContentItem = TextContent | ImageContent | VideoContent;

// 构建 content 数组 - 符合 Seedance 2.0 官方 API 格式
function buildContent(
  promptBoxes: CreateTaskRequest["prompt_boxes"],
  assets: Array<{
    id: string;
    url: string;
    type: string;
    display_name?: string;
    name: string;
    keyframe_description?: string;
    is_keyframe?: boolean;
  }>
): ContentItem[] {
  const content: ContentItem[] = [];
  
  // 分类素材
  const imageAssets = assets.filter((a) => a.type === "image");
  const keyframeAssets = assets.filter((a) => a.type === "keyframe" || a.is_keyframe);
  
  // 按顺序处理每个提示词框
  const sortedBoxes = promptBoxes
    .filter((box) => box.content.trim())
    .sort((a, b) => a.order - b.order);

  for (const box of sortedBoxes) {
    // 找到该提示词框激活的素材
    let activatedAsset = null;
    if (box.is_activated && box.activated_asset_id) {
      activatedAsset = assets.find((a) => a.id === box.activated_asset_id);
    }

    // 如果没有指定，使用第一个可用的图片或关键帧
    if (!activatedAsset) {
      activatedAsset = imageAssets[0] || keyframeAssets[0] || null;
    }

    // 添加文本内容
    const textContent = box.content.trim();
    if (textContent) {
      content.push({
        type: "text",
        text: textContent,
      });
    }

    // 添加图片内容（如果有）
    if (activatedAsset && (activatedAsset.type === "image" || activatedAsset.type === "keyframe")) {
      const displayName = activatedAsset.display_name || activatedAsset.name;
      
      // 根据素材类型设置 role
      let role: "first_frame" | "reference_image" | undefined;
      if (activatedAsset.type === "keyframe" || activatedAsset.is_keyframe) {
        role = "first_frame";
      } else {
        role = "reference_image";
      }

      content.push({
        type: "image_url",
        image_url: {
          url: activatedAsset.url,
        },
        role,
      });
    }
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
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    // 获取选中的素材
    const client = getSupabaseClient();
    const { data: assets, error: assetsError } = await client
      .from("assets")
      .select("*")
      .in("id", selected_assets);

    if (assetsError) {
      return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
    }

    // 构建 content 数组
    const content = buildContent(prompt_boxes, assets || []);

    if (content.length === 0) {
      return NextResponse.json({ error: "No content to generate" }, { status: 400 });
    }

    // 构建请求参数 - 严格按照 API 文档格式
    const requestBody: Record<string, unknown> = {
      model: modelId,
      content,
      generate_audio: true,
      ratio: params.ratio,
      duration: params.duration,
      resolution: params.resolution,
      watermark: false,
      return_last_frame: true,  // 请求返回尾帧
    };

    console.log("Seedance API Request:", JSON.stringify(requestBody, null, 2));

    // 先保存任务到数据库（状态为 pending）
    const tempTaskId = `temp-${Date.now()}`;
    const { error: tempInsertError } = await client.from("tasks").insert({
      project_id,
      id: tempTaskId,
      status: "pending",
      model_mode: "standard",
      model_id: MODEL_ID,
      progress: 0,
      prompt_boxes,
      selected_assets,
      params,
      queued_at: new Date().toISOString(),
    });

    if (tempInsertError) {
      console.error("Failed to create temp task:", tempInsertError);
    }

    try {
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
        // 更新失败任务状态
        await client.from("tasks").update({
          status: "failed",
          error_message: data.error?.message || JSON.stringify(data),
        }).eq("id", tempTaskId);

        return NextResponse.json({ 
          error: data.error?.message || data.error?.code || "API request failed" 
        }, { status: response.status });
      }

      // 更新任务 ID 为真实的 API 返回 ID，并设置队列时间
      const taskId = data.id;
      await client.from("tasks").update({
        id: taskId,
        task_id_external: taskId,
        status: "queued",
        queued_at: new Date().toISOString(),
      }).eq("id", tempTaskId);

      return NextResponse.json({
        id: taskId,
        status: "queued",
        model: modelId,
      });
    } catch (apiError) {
      // API 调用失败，更新任务状态为失败
      await client.from("tasks").update({
        status: "failed",
        error_message: apiError instanceof Error ? apiError.message : String(apiError),
      }).eq("id", tempTaskId);

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
