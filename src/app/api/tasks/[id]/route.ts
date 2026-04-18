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

    const data = {
      ...row,
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
