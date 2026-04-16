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

interface AudioContent {
  type: "audio_url";
  audio_url: {
    url: string;
  };
  role: "reference_audio";
}

type ContentItem = TextContent | ImageContent | VideoContent | AudioContent;

// 构建 content 数组 - 符合 Seedance 2.0 官方 API 格式
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
  const imageAssets = assets.filter((a) => a.type === "image");
  const keyframeAssets = assets.filter((a) => a.type === "keyframe" || a.is_keyframe);
  const audioAssets = assets.filter((a) => a.type === "audio");

  // 收集所有需要引用的图片素材（按顺序编号）
  const referencedAssets: Array<{
    asset: typeof imageAssets[0] | typeof keyframeAssets[0];
    index: number;
  }> = [];

  // 按顺序处理每个提示词框，收集激活的素材
  const sortedBoxes = promptBoxes
    .filter((box) => box.content.trim())
    .sort((a, b) => a.order - b.order);

  for (const box of sortedBoxes) {
    let activatedAsset = null;

    // 优先使用框内激活的素材
    if (box.is_activated && box.activated_asset_id) {
      activatedAsset = assets.find((a) => a.id === box.activated_asset_id);
    }

    // 如果没有指定，使用第一个可用的图片或关键帧
    if (!activatedAsset) {
      activatedAsset = imageAssets[0] || keyframeAssets[0] || null;
    }

    // 检查是否已经引用过这个素材
    if (activatedAsset && (activatedAsset.type === "image" || activatedAsset.type === "keyframe")) {
      const alreadyReferenced = referencedAssets.find(
        (ref) => ref.asset.id === activatedAsset!.id
      );

      if (!alreadyReferenced) {
        referencedAssets.push({
          asset: activatedAsset,
          index: referencedAssets.length + 1,
        });
      }
    }
  }

  // 如果没有任何激活的素材，使用第一个可用的图片或关键帧
  if (referencedAssets.length === 0) {
    const defaultAsset = imageAssets[0] || keyframeAssets[0];
    if (defaultAsset) {
      referencedAssets.push({
        asset: defaultAsset,
        index: 1,
      });
    }
  }

  // 添加所有图片（使用 [图N] 编号）
  for (const ref of referencedAssets) {
    const isKeyframe = ref.asset.asset_category === "keyframe";

    // 关键帧用 first_frame，参考图用 reference_image
    const role = isKeyframe ? "first_frame" : "reference_image";

    content.push({
      type: "image_url",
      image_url: {
        url: ref.asset.url,
      },
      role,
    });
  }

  // 构建合并的文本提示词（使用 [图1]、[图2] 等引用）
  const textParts: string[] = [];

  for (const ref of referencedAssets) {
    const displayName = ref.asset.display_name || ref.asset.name;
    const isKeyframe = ref.asset.asset_category === "keyframe";

    // 根据素材类型添加引用标记
    if (isKeyframe) {
      // 关键帧：[图1]关键帧描述
      const desc = ref.asset.keyframe_description || "";
      if (desc) {
        textParts.push(`[图${ref.index}]${desc}@${displayName}`);
      } else {
        textParts.push(`[图${ref.index}]@${displayName}`);
      }
    } else {
      // 参考图：[图1]"图片名"
      textParts.push(`[图${ref.index}]"${displayName}"`);
    }
  }

  // 添加每个提示词框的内容（按顺序）
  for (const box of sortedBoxes) {
    if (box.content.trim()) {
      textParts.push(box.content.trim());
    }
  }

  // 添加合并的文本（只有一个 text 对象）
  if (textParts.length > 0) {
    content.push({
      type: "text",
      text: textParts.join("\n"),
    });
  }

  // 添加绑定的音频（如果有绑定的参考图）
  const refImageAssets = referencedAssets.filter(
    (ref) => ref.asset.asset_category !== "keyframe"
  );

  for (const ref of refImageAssets) {
    if (ref.asset.bound_audio_id) {
      const boundAudio = audioAssets.find((a) => a.id === ref.asset!.bound_audio_id);
      if (boundAudio) {
        const audioName = boundAudio.display_name || boundAudio.name;
        // 在文本中添加音频引用
        const lastText = content[content.length - 1];
        if (lastText && lastText.type === "text") {
          lastText.text += `\n[图${ref.index}]声线为@${audioName}`;
        }
      }
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
      ?.filter((a) => (a.type === "image" || a.type === "keyframe") && a.bound_audio_id)
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

    // 构建请求参数 - 严格按照 API 文档格式
    const requestBody: Record<string, unknown> = {
      model: MODEL_ID,
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
        model: MODEL_ID,
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
