import { NextRequest, NextResponse } from "next/server";
import { getDb, parseJsonField } from "@/storage/database/sqlite-client";

// GET /api/projects/[id]/tasks - 获取项目的所有任务
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC")
      .all(resolvedParams.id) as Record<string, unknown>[];

    // 解析 JSON 字段，并过滤敏感字段
    const data = rows.map((row) => {
      const { api_key: _apiKey, ...safeRow } = row;
      void _apiKey;
      return {
        ...safeRow,
        prompt_boxes: parseJsonField(row.prompt_boxes as string | null, []),
        selected_assets: parseJsonField(row.selected_assets as string | null, []),
        params: parseJsonField(row.params as string | null, null),
        result: parseJsonField(row.result as string | null, null),
      };
    });

    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/projects/[id]/tasks error:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}
