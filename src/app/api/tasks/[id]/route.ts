import { NextRequest, NextResponse } from "next/server";
import { getDb, parseJsonField } from "@/storage/database/sqlite-client";

// DELETE /api/tasks/[id] - 删除任务
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();
    db.prepare("DELETE FROM tasks WHERE id = ?").run(resolvedParams.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete task" }, { status: 500 });
  }
}

// PATCH /api/tasks/[id] - 更新任务（支持取消）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json() as { action?: string };
    const db = getDb();

    if (body.action === "cancel") {
      const task = db.prepare("SELECT task_id_external, status, api_key FROM tasks WHERE id = ?").get(resolvedParams.id) as Record<string, unknown> | undefined;

      if (!task) {
        return NextResponse.json({ error: "Task not found" }, { status: 404 });
      }

      // 只允许取消排队中的任务
      if (task.status !== "queued" && task.status !== "pending") {
        return NextResponse.json({ error: "只能取消排队中的任务" }, { status: 400 });
      }

      // 调用 Seedance API 取消远端任务
      if (task.task_id_external) {
        const apiKey = task.api_key || request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
        if (apiKey) {
          try {
            const response = await fetch(
              `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${task.task_id_external}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${apiKey}` },
              }
            );

            // Seedance 只允许取消 queued 状态的任务
            // 如果返回非 204/200，说明任务已进入 running，取消失败
            if (!response.ok && response.status !== 204) {
              let apiErrorMessage = "取消失败，任务已在生成中";
              try {
                const errorData = await response.json();
                apiErrorMessage = errorData.error?.message || apiErrorMessage;
              } catch {
                // 响应体非 JSON
              }
              console.warn("[CANCEL TASK] Seedance API cancel failed:", response.status, apiErrorMessage);
              return NextResponse.json({ error: "取消失败，任务已在生成中" }, { status: 409 });
            }
          } catch (apiError) {
            console.error("[CANCEL TASK] Seedance API call failed:", apiError);
            return NextResponse.json({ error: "取消请求失败，请重试" }, { status: 500 });
          }
        }
      }

      // 取消成功，更新本地状态
      db.prepare(`
        UPDATE tasks SET status = 'cancelled', completed_at = datetime('now', 'localtime'), updated_at = datetime('now', 'localtime')
        WHERE id = ?
      `).run(resolvedParams.id);

      return NextResponse.json({ success: true, status: "cancelled" });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET /api/tasks/[id] - 获取单个任务
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();
    const row = db.prepare("SELECT * FROM tasks WHERE id = ?").get(resolvedParams.id) as Record<string, unknown> | undefined;

    if (!row) {
      return NextResponse.json(null);
    }

    // 过滤敏感字段
    const { api_key: _apiKey, ...safeRow } = row;
    void _apiKey;
    const data = {
      ...safeRow,
      prompt_boxes: parseJsonField(row.prompt_boxes as string | null, []),
      selected_assets: parseJsonField(row.selected_assets as string | null, []),
      params: parseJsonField(row.params as string | null, null),
      result: parseJsonField(row.result as string | null, null),
    };

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/tasks/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch task" }, { status: 500 });
  }
}
