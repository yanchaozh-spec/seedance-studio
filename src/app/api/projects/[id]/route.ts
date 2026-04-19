import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { deleteFile, isTosConfigured } from "@/storage/tos/client";
import { generateSlug } from "@/lib/slug";

// GET /api/projects/[id] - 获取单个项目
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();
    const data = db.prepare("SELECT * FROM projects WHERE id = ?").get(resolvedParams.id);
    return NextResponse.json(data || null);
  } catch (error) {
    console.error("GET /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

// PATCH /api/projects/[id] - 更新项目
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const db = getDb();

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) {
      updateData.name = body.name;
      // 名称变更时同步更新 slug
      updateData.slug = generateSlug(body.name, resolvedParams.id);
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // 白名单校验：只允许更新 name 和 slug
    const allowedKeys = new Set(["name", "slug"]);
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(updateData)) {
      if (!allowedKeys.has(key)) continue;
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
    setClauses.push("updated_at = datetime('now', 'localtime')");
    values.push(resolvedParams.id);

    const stmt = db.prepare(`UPDATE projects SET ${setClauses.join(", ")} WHERE id = ?`);
    stmt.run(...values);

    const data = db.prepare("SELECT * FROM projects WHERE id = ?").get(resolvedParams.id);
    return NextResponse.json(data);
  } catch (error) {
    console.error("PATCH /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE /api/projects/[id] - 删除项目（级联删除关联素材和任务）
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();

    // 1. 获取项目关联的素材 storage_key，用于删除 TOS 文件
    const assets = db.prepare("SELECT storage_key FROM assets WHERE project_id = ?").all(resolvedParams.id) as { storage_key: string | null }[];

    // 2. 获取项目关联的任务 storage_key，用于删除 TOS 视频
    const tasks = db.prepare("SELECT video_storage_key FROM tasks WHERE project_id = ?").all(resolvedParams.id) as { video_storage_key: string | null }[];

    // 3. 删除 TOS 上的文件（不阻塞主流程）
    if (isTosConfigured()) {
      const allKeys = [
        ...assets.map((a) => a.storage_key),
        ...tasks.map((t) => t.video_storage_key),
      ].filter(Boolean) as string[];

      for (const key of allKeys) {
        try {
          await deleteFile(key);
        } catch (err) {
          console.error("[DELETE PROJECT] Failed to delete TOS file:", key, err);
        }
      }
    }

    // 4. 级联删除关联数据（先子表后主表）
    db.prepare("DELETE FROM assets WHERE project_id = ?").run(resolvedParams.id);
    db.prepare("DELETE FROM tasks WHERE project_id = ?").run(resolvedParams.id);
    db.prepare("DELETE FROM projects WHERE id = ?").run(resolvedParams.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
