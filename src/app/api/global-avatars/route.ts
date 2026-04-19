import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { syncGlobalAvatarsToTos } from "@/lib/global-avatars-sync";

// GET /api/global-avatars - 获取所有全局虚拟人像
export async function GET() {
  try {
    const db = getDb();
    const data = db
      .prepare("SELECT * FROM global_avatars ORDER BY created_at DESC")
      .all() as Record<string, unknown>[];
    return NextResponse.json(data || []);
  } catch (error) {
    console.error("GET /api/global-avatars error:", error);
    return NextResponse.json({ error: "Failed to fetch global avatars" }, { status: 500 });
  }
}

// POST /api/global-avatars - 添加全局虚拟人像
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const db = getDb();

    if (!body.asset_id?.trim()) {
      return NextResponse.json({ error: "Asset ID is required" }, { status: 400 });
    }

    // 检查是否已存在相同 asset_id
    const existing = db
      .prepare("SELECT id FROM global_avatars WHERE asset_id = ?")
      .get(body.asset_id.trim()) as { id: string } | undefined;

    let result: Record<string, unknown>;

    if (existing) {
      // 已存在则更新
      result = db.prepare(`
        UPDATE global_avatars
        SET display_name = COALESCE(?, display_name),
            thumbnail_url = COALESCE(?, thumbnail_url),
            description = COALESCE(?, description),
            source_project_id = COALESCE(?, source_project_id),
            updated_at = datetime('now', 'localtime')
        WHERE asset_id = ?
        RETURNING *
      `).get(
        body.display_name || null,
        body.thumbnail_url || null,
        body.description || null,
        body.source_project_id || null,
        body.asset_id.trim()
      ) as Record<string, unknown>;
    } else {
      result = db.prepare(`
        INSERT INTO global_avatars (asset_id, display_name, thumbnail_url, description, source_project_id)
        VALUES (?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        body.asset_id.trim(),
        body.display_name || "",
        body.thumbnail_url || null,
        body.description || "",
        body.source_project_id || null
      ) as Record<string, unknown>;
    }

    // 异步同步到 TOS
    syncGlobalAvatarsToTos(body.tosConfig).catch((err) =>
      console.warn("[global-avatars] TOS sync failed:", err)
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/global-avatars error:", error);
    return NextResponse.json({ error: "Failed to create global avatar" }, { status: 500 });
  }
}
