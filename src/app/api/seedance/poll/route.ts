import { NextRequest, NextResponse } from "next/server";

// 轮询任务状态
export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json();

    if (!taskId) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    // 调用 GET 接口获取状态
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    const response = await fetch(
      `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error || "API request failed" }, { status: response.status });
    }

    // 计算进度
    let progress = 0;
    if (data.status === "queued") {
      progress = 10;
    } else if (data.status === "running") {
      progress = 50;
    } else if (data.status === "succeeded") {
      progress = 100;
    }

    // 更新数据库
    const { getSupabaseClient } = await import("@/storage/database/supabase-client");
    const client = getSupabaseClient();
    
    const updateData: Record<string, unknown> = {
      status: data.status,
      progress,
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
      progress,
      result: updateData.result,
      error_message: updateData.error_message,
    });
  } catch (error) {
    console.error("Poll task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
