import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 重新生成单个分段
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: segmentId } = await params;

    if (!segmentId) {
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
      .eq("id", segmentId)
      .single();

    if (segmentError || !segment) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    // 检查是否可以重新生成
    if (!["waiting_confirm", "failed", "confirmed"].includes(segment.status)) {
      return NextResponse.json(
        { error: "Cannot regenerate segment in current status" },
        { status: 400 }
      );
    }

    // 获取上一段的分段
    let previousLastFrameUrl = null;
    if (segment.segment_index > 0) {
      const { data: previousSegment } = await client
        .from("video_segments")
        .select("*")
        .eq("long_video_id", segment.long_video_id)
        .eq("segment_index", segment.segment_index - 1)
        .single();

      if (previousSegment?.last_frame_url) {
        previousLastFrameUrl = previousSegment.last_frame_url;
      }
    }

    // 重置分段状态
    await client
      .from("video_segments")
      .update({
        status: "pending",
        video_url: null,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", segmentId);

    // 构建请求体
    const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";
    const MODEL_ID = "doubao-seedance-2-0-260128";

    const content: Array<{ type: string; text?: string; image_url?: { url: string }; role?: string }> = [];

    // 首帧
    const firstFrame = previousLastFrameUrl || segment.first_frame_url;
    if (firstFrame) {
      content.push({
        type: "image_url",
        image_url: { url: firstFrame },
        role: "first_frame",
      });
    }

    // 获取提示词
    const prompts = segment.prompt_content || [];
    const sortedPrompts = prompts
      .filter((p: { content: string }) => p.content?.trim())
      .sort((a: { order: number }, b: { order: number }) => a.order - b.order);

    if (sortedPrompts.length > 0) {
      let promptText = sortedPrompts
        .map((p: { content: string }) => p.content.trim())
        .join("\n");

      if (firstFrame) {
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
      await client
        .from("video_segments")
        .update({
          status: "failed",
          error_message: data.error?.message || "API error",
          updated_at: new Date().toISOString(),
        })
        .eq("id", segmentId);

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
        updated_at: new Date().toISOString(),
      })
      .eq("id", segmentId);

    // 异步轮询任务状态
    pollTaskStatus(segmentId, taskId, apiKey).catch((error) => {
      console.error("[Regenerate Segment] Poll error:", error);
    });

    return NextResponse.json({
      segment_id: segmentId,
      task_id: taskId,
    });
  } catch (error) {
    console.error("Regenerate segment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function pollTaskStatus(
  segmentId: string,
  taskId: string,
  apiKey: string,
  maxAttempts = 200,
  interval = 3000
): Promise<void> {
  const client = getSupabaseClient();
  const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";

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

  await client
    .from("video_segments")
    .update({
      status: "failed",
      error_message: "Polling timeout",
      updated_at: new Date().toISOString(),
    })
    .eq("id", segmentId);
}
