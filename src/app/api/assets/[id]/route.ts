import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { deleteFile, isTosConfigured } from "@/storage/tos/client";

// DELETE /api/assets/[id] - 删除素材
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();

    // 先获取素材信息，包括 storage_key
    const asset = db
      .prepare("SELECT storage_key FROM assets WHERE id = ?")
      .get(resolvedParams.id) as { storage_key: string | null } | undefined;

    // 如果 TOS 已配置且有 storage_key，先删除 TOS 文件
    if (isTosConfigured() && asset?.storage_key) {
      try {
        await deleteFile(asset.storage_key);
        console.log("[TOS] Deleted file:", asset.storage_key);
      } catch (deleteError) {
        console.error("[TOS] Failed to delete file:", deleteError);
        // 继续删除数据库记录，不阻塞删除流程
      }
    }

    // 删除数据库记录
    db.prepare("DELETE FROM assets WHERE id = ?").run(resolvedParams.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/assets/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
  }
}

// PATCH /api/assets/[id] - 更新素材（如绑定音频）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const updates = await request.json() as Record<string, unknown>;
    const db = getDb();

    // 动态构建 SET 子句
    const allowedFields = [
      "name", "display_name", "type", "asset_category", "is_keyframe",
      "keyframe_description", "keyframe_source_task_id", "url", "thumbnail_url",
      "size", "duration", "storage_key", "bound_audio_id", "sort_order"
    ];
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (setClauses.length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
    }

    setClauses.push("updated_at = datetime('now', 'localtime')");
    values.push(resolvedParams.id);

    const stmt = db.prepare(`UPDATE assets SET ${setClauses.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    const data = db.prepare("SELECT * FROM assets WHERE id = ?").get(resolvedParams.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("PATCH /api/assets/[id] error:", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
}
