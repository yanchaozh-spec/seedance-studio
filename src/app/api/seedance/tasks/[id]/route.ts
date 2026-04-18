import { NextRequest, NextResponse } from "next/server";

// 删除/取消任务
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    // 获取 ARK API Key
    const apiKey = request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    // 调用 DELETE 接口
    const response = await fetch(
      `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    // DELETE 接口没有返回体，204 表示成功
    if (!response.ok && response.status !== 204) {
      let errorMessage = "API request failed";
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch {
        // 响应体不是 JSON 或为空
      }
      console.error("[DELETE TASK] API error:", response.status, errorMessage);
      return NextResponse.json({ error: errorMessage }, { status: response.status });
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("[DELETE TASK] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
