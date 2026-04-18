import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";

// PATCH /api/assets/reorder - 批量更新素材排序
// 请求体: { items: [{ id: string, sort_order: number }, ...] }
export async function PATCH(request: NextRequest) {
  try {
    const { items } = await request.json() as { items: Array<{ id: string; sort_order: number }> };

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items must be a non-empty array" },
        { status: 400 }
      );
    }

    // 校验每项结构
    for (const item of items) {
      if (!item.id || typeof item.sort_order !== "number") {
        return NextResponse.json(
          { error: "Each item must have id (string) and sort_order (number)" },
          { status: 400 }
        );
      }
    }

    const db = getDb();
    const stmt = db.prepare("UPDATE assets SET sort_order = ?, updated_at = datetime('now', 'localtime') WHERE id = ?");

    // 使用事务批量更新
    const transaction = db.transaction(() => {
      for (const item of items) {
        stmt.run(item.sort_order, item.id);
      }
    });
    transaction();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/assets/reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder assets" },
      { status: 500 }
    );
  }
}
