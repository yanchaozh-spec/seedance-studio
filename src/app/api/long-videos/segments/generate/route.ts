import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MODEL_ID = "doubao-seedance-2-0-260128";

// Content item 类型定义
type ContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role?: string };

// 生成单个分段
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { segment_id, first_frame_url } = body;

    if (!segment_id) {
      return NextResponse.json(
        { error: "Segment ID required" },
        { status: 400 }
      );
    }

    // 获取 ARK API Key
    const apiKey = request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "ARK API Key not configured" },
        { status: 500 }
      );
    }

    const client = getSupabaseClient();

    // 获取分段信息
    const { data: segment, error: segmentError } = await client
      .from("video_segments")
      .select("*")
      .eq("id", segment_id)
      .single();

    if (segmentError || !segment) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    // 如果有上一段尾帧，设置为当前段的首帧
    let firstFrame = first_frame_url || segment.first_frame_url;

    // 构建 content 数组
    const content: ContentItem[] = [];

    // 如果有首帧图片，添加首帧
    if (firstFrame) {
      content.push({
        type: "image_url",
        image_url: { url: firstFrame },
        role: "first_frame",
      });
    }

    // 获取素材信息
    const assetIds = segment.asset_ids || [];
    let imageUrl = null;

    if (assetIds.length > 0) {
      const { data: assets } = await client
        .from("assets")
        .select("*")
        .in("id", assetIds);

      // 找到第一个图片或关键帧
      const imageAsset = (assets || []).find(
        (a) => a.type === "image" || a.type === "keyframe"
      );
      if (imageAsset && !firstFrame) {
        imageUrl = imageAsset.url;
        content.push({
          type: "image_url",
          image_url: { url: imageAsset.url },
          role: "first_frame",
        });
      }
    }

    // 获取提示词
    const prompts = segment.prompt_content || [];
    const sortedPrompts = prompts
      .filter((p: { content: string }) => p.content?.trim())
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order);

    if (sortedPrompts.length > 0) {
      // 构建提示词文本
      let promptText = sortedPrompts
        .map((p: { content: string }) => p.content.trim())
        .join("\n");

      // 如果有首帧图片，在提示词中添加描述
      if (firstFrame || imageUrl) {
        promptText = `视频首帧是上图的画面，${promptText}`;
      }

      content.push({
        type: "text",
        text: promptText,
      });
    }

    if (content.length === 0) {
      return NextResponse.json(
        { error: "No content to generate" },
        { status: 400 }
      );
    }

    // 构建请求体
    const requestBody = {
      model: MODEL_ID,
      content,
      generate_audio: segment.segment_generate_audio ?? true,
      ratio: segment.segment_ratio || "16:9",
      duration: segment.segment_duration || 5,
      resolution: segment.segment_resolution || "720p",
      watermark: false,
      return_last_frame: true,
    };

    console.log("[Generate Segment] Request:", JSON.stringify(requestBody, null, 2));

    // 调用 Seedance API
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
      // 更新分段状态为失败
      await client
        .from("video_segments")
        .update({
          status: "failed",
          error_message: data.error?.message || "API error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", segment_id);

      return NextResponse.json(
        { error: data.error || "API request failed" },
        { status: response.status }
      );
    }

    const taskId = data.id;

    // 更新分段状态
    await client
      .from("video_segments")
      .update({
        task_id: taskId,
        status: "running",
        first_frame_url: firstFrame || imageUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment_id);

    // 异步轮询任务状态
    pollTaskStatus(segment_id, taskId, apiKey).catch((error) => {
      console.error("[Generate Segment] Poll error:", error);
    });

    return NextResponse.json({
      segment_id,
      task_id: taskId,
    });
  } catch (error) {
    console.error("Generate segment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// 轮询任务状态
async function pollTaskStatus(
  segmentId: string,
  taskId: string,
  apiKey: string,
  maxAttempts = 200,
  interval = 3000
): Promise<void> {
  const client = getSupabaseClient();

  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${ARK_API_URL}/contents/generations/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      await client
        .from("video_segments")
        .update({
          status: "failed",
          error_message: data.error?.message || "API error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", segmentId);
      return;
    }

    if (data.status === "succeeded") {
      await client
        .from("video_segments")
        .update({
          status: "waiting_confirm",
          video_url: data.content?.video_url,
          last_frame_url: data.content?.last_frame_url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", segmentId);
      return;
    }

    if (data.status === "failed") {
      await client
        .from("video_segments")
        .update({
          status: "failed",
          error_message: data.error?.message || "Generation failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", segmentId);
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // 超时
  await client
    .from("video_segments")
    .update({
      status: "failed",
      error_message: "Polling timeout",
      updated_at: new Date().toISOString(),
    })
    .eq("id", segmentId);
}
