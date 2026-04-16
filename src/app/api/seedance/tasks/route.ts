import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MODEL_ID = "doubao-seedance-2-0-260128";

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

// Content item 类型定义
type ContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "audio_url"; audio_url: { url: string } };

// 构建符合 Seedance 2.0 格式的提示词
function buildPrompt(
  boxContent: string,
  asset: {
    display_name: string;
    name: string;
    type: string;
    bound_audio_id?: string;
    voice_description?: string;
    keyframe_description?: string;
  } | null,
  keyframeDesc?: string
): string {
  if (!asset) return boxContent;

  const displayName = asset.display_name || asset.name;

  // 关键帧特殊处理
  if (asset.type === "keyframe") {
    const desc = keyframeDesc || asset.keyframe_description || "";
    if (desc) {
      return `视频首帧@"${displayName}"，${desc}，${boxContent}`;
    }
    return `视频首帧@"${displayName}"，${boxContent}`;
  }

  // 普通图片处理
  let referenceText = `"${displayName}"@这张图片`;

  // 如果绑定了音频，添加声线描述
  if (asset.voice_description) {
    referenceText += `，声线为"${asset.voice_description}"`;
  }

  return `${referenceText}，${boxContent}`;
}

// 创建视频生成任务
export async function POST(request: NextRequest) {
  try {
    const body: CreateTaskRequest = await request.json();
    const { project_id, prompt_boxes, selected_assets, params } = body;

    // 获取 ARK API Key
    const apiKey = process.env.ARK_API_KEY;
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

    // 分类素材
    const imageAssets = (assets || []).filter((a) => a.type === "image");
    const keyframeAssets = (assets || []).filter((a) => a.type === "keyframe" || a.is_keyframe);
    const audioAssets = (assets || []).filter((a) => a.type === "audio");

    // 构建 content 数组 - 严格按照 Seedance 2.0 格式
    // 使用 role 字段区分系统指令和用户内容
    const content: ContentItem[] = [];

    // 按顺序处理每个提示词框
    const sortedBoxes = prompt_boxes
      .filter((box) => box.content.trim())
      .sort((a, b) => a.order - b.order);

    // 第一个框作为主体
    let isFirstBox = true;

    for (const box of sortedBoxes) {
      // 找到该提示词框激活的素材
      let activatedAsset = null;
      if (box.is_activated && box.activated_asset_id) {
        activatedAsset = (assets || []).find((a) => a.id === box.activated_asset_id);
      }

      // 如果没有指定，使用第一个可用的图片或关键帧
      if (!activatedAsset) {
        activatedAsset = imageAssets[0] || keyframeAssets[0] || null;
      }

      // 获取该素材绑定的音频信息
      let voiceDesc: string | undefined;
      if (activatedAsset?.bound_audio_id) {
        const boundAudio = audioAssets.find((a) => a.id === activatedAsset!.bound_audio_id);
        voiceDesc = boundAudio?.voice_description;
      }

      // 构建提示词文本
      const promptText = buildPrompt(
        box.content.trim(),
        activatedAsset
          ? {
              ...activatedAsset,
              voice_description: voiceDesc,
            }
          : null,
        box.keyframe_description
      );

      // 第一个框：添加文本内容
      if (isFirstBox) {
        content.push({
          type: "text",
          text: promptText,
        });

        // 第一个框如果有图片素材，添加图片 URL
        if (activatedAsset && (activatedAsset.type === "image" || activatedAsset.type === "keyframe")) {
          content.push({
            type: "image_url",
            image_url: {
              url: activatedAsset.url,
            },
          });
        }

        isFirstBox = false;
      } else {
        // 后续框作为参考
        content.push({
          type: "text",
          text: promptText,
        });

        // 如果有图片素材，添加图片 URL
        if (activatedAsset && (activatedAsset.type === "image" || activatedAsset.type === "keyframe")) {
          content.push({
            type: "image_url",
            image_url: {
              url: activatedAsset.url,
            },
          });
        }
      }
    }

    if (content.length === 0) {
      return NextResponse.json({ error: "No content to generate" }, { status: 400 });
    }

    // 构建请求参数 - 严格按照 Seedance 2.0 官方格式
    const requestBody: Record<string, unknown> = {
      model: MODEL_ID,
      content,
      generate_audio: true,
      ratio: params.ratio,
      duration: params.duration,
      watermark: false,
    };

    // 处理首帧描述（如果有）
    const keyframeDesc = prompt_boxes.find((box) => box.keyframe_description)?.keyframe_description;
    if (keyframeDesc && keyframeAssets.length > 0) {
      requestBody.first_frame_description = keyframeDesc;
    }

    // 处理首帧图片（如果有关键帧）
    if (keyframeAssets.length > 0 && keyframeAssets[0]) {
      // 注意：首帧图片应该在 content 数组的第一个 image_url 中已经添加
      // 如果 API 需要单独的首帧字段，可以在这里添加
      requestBody.first_frame_image = keyframeAssets[0].url;
    }

    console.log("Seedance API Request:", JSON.stringify(requestBody, null, 2));

    // 先保存任务到数据库（状态为 pending）
    const tempTaskId = `temp-${Date.now()}`;
    const { error: tempInsertError } = await client.from("tasks").insert({
      project_id,
      id: tempTaskId,
      status: "pending",
      progress: 0,
      prompt_boxes,
      selected_assets,
      params,
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

        return NextResponse.json({ error: data.error || "API request failed" }, { status: response.status });
      }

      // 更新任务 ID 为真实的 API 返回 ID
      const taskId = data.id;
      await client.from("tasks").update({
        id: taskId,
        status: "queued",
      }).eq("id", tempTaskId);

      return NextResponse.json({
        id: taskId,
        status: "queued",
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

    const apiKey = process.env.ARK_API_KEY;
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
      return NextResponse.json({ error: data.error || "API request failed" }, { status: response.status });
    }

    // 更新数据库中的任务状态
    const client = getSupabaseClient();
    const status = data.status === "succeeded" ? "succeeded" : data.status === "failed" ? "failed" : data.status;

    const updateData: Record<string, unknown> = {
      status,
      progress: data.status === "running" ? 50 : data.status === "succeeded" ? 100 : 0,
    };

    if (data.status === "succeeded" && data.content) {
      updateData.result = {
        video_url: data.content.video_url,
        resolution: data.resolution,
        duration: data.duration,
      };
    }

    if (data.status === "failed") {
      updateData.error_message = data.error?.message || "Generation failed";
    }

    await client.from("tasks").update(updateData).eq("id", taskId);

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: updateData.progress,
      result: updateData.result,
      error_message: updateData.error_message,
    });
  } catch (error) {
    console.error("Get task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
