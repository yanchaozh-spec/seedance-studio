import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";

// 轮询任务状态
export async function POST(request: NextRequest) {
  try {
    const { taskId } = await request.json() as { taskId: string };

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
      const rawError = typeof data.error === "string" ? data.error : data.error?.message || "API request failed";
      return NextResponse.json({ error: rawError }, { status: response.status });
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
    const db = getDb();

    const updateData: Record<string, unknown> = {
      status: data.status,
      progress,
      updated_at: new Date().toISOString(),
    };

    if (data.status === "succeeded" && data.content) {
      updateData.result = JSON.stringify({
        video_url: data.content.video_url,
        resolution: data.resolution,
        duration: data.duration,
      });
    }

    if (data.status === "failed") {
      updateData.error_message = data.error?.message || "Generation failed";
    }

    // 动态构建 UPDATE
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(updateData)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
    values.push(taskId);

    db.prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

    const parsedResult = typeof updateData.result === "string" ? JSON.parse(updateData.result) : updateData.result;

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress,
      result: parsedResult,
      error_message: updateData.error_message,
    });
  } catch (error) {
    console.error("Poll task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
