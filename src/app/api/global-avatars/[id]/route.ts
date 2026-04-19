import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { syncGlobalAvatarsToTos } from "@/lib/global-avatars-sync";

// PATCH /api/global-avatars/[id] - 更新全局虚拟人像
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const db = getDb();

    // 构建动态更新字段
    const updates: string[] = [];
    const values: unknown[] = [];

    if (body.display_name !== undefined) {
      updates.push("display_name = ?");
      values.push(body.display_name);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }
    if (body.thumbnail_url !== undefined) {
      updates.push("thumbnail_url = ?");
      values.push(body.thumbnail_url);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    updates.push("updated_at = datetime('now', 'localtime')");
    values.push(resolvedParams.id);

    const sql = `UPDATE global_avatars SET ${updates.join(", ")} WHERE id = ? RETURNING *`;
    const result = db.prepare(sql).get(...values) as Record<string, unknown> | undefined;

    if (!result) {
      return NextResponse.json({ error: "Global avatar not found" }, { status: 404 });
    }

    // 异步同步到 TOS
    syncGlobalAvatarsToTos(body.tosConfig).catch((err) =>
      console.warn("[global-avatars] TOS sync failed:", err)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("PATCH /api/global-avatars/[id] error:", error);
    return NextResponse.json({ error: "Failed to update global avatar" }, { status: 500 });
  }
}

// DELETE /api/global-avatars/[id] - 删除全局虚拟人像
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();
    db.prepare("DELETE FROM global_avatars WHERE id = ?").run(resolvedParams.id);

    // 异步同步到 TOS（DELETE 请求没有 body，无法获取 tosConfig，从环境变量尝试）
    syncGlobalAvatarsToTos().catch((err) =>
      console.warn("[global-avatars] TOS sync failed:", err)
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/global-avatars/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete global avatar" }, { status: 500 });
  }
}
