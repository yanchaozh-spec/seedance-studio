import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { getFileUrl, isTosConfigured } from "@/storage/tos/client";

// GET /api/projects/[id]/assets - 获取项目的所有素材
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();
    const data = db
      .prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY sort_order ASC, created_at DESC")
      .all(resolvedParams.id) as Record<string, unknown>[];

    // 如果 TOS 已配置，为有 storage_key 的素材生成签名 URL
    if (isTosConfigured() && data && data.length > 0) {
      const assetsWithUrls = await Promise.all(
        data.map(async (asset) => {
          if (asset.storage_key) {
            try {
              const signedUrl = await getFileUrl(asset.storage_key as string);
              return {
                ...asset,
                url: signedUrl,
                thumbnail_url: asset.type === "image" ? signedUrl : asset.thumbnail_url,
              };
            } catch (err) {
              console.error("Failed to generate signed URL for asset:", asset.id, err);
              return asset;
            }
          }
          return asset;
        })
      );
      return NextResponse.json(assetsWithUrls);
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("GET /api/projects/[id]/assets error:", error);
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
  }
}

// POST /api/projects/[id]/assets - 创建素材记录
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const db = getDb();

    // 获取当前项目最大的 sort_order
    const maxResult = db
      .prepare("SELECT MAX(sort_order) as max_order FROM assets WHERE project_id = ?")
      .get(resolvedParams.id) as { max_order: number | null } | undefined;
    const nextSortOrder = (maxResult?.max_order ?? -1) + 1;

    const data = db.prepare(`
      INSERT INTO assets (project_id, name, display_name, type, is_keyframe,
        keyframe_description, keyframe_source_task_id, url, thumbnail_url,
        size, duration, storage_key, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      resolvedParams.id,
      body.name || "",
      body.display_name || null,
      body.type || "image",
      body.is_keyframe ? 1 : 0,
      body.keyframe_description || null,
      body.keyframe_source_task_id || null,
      body.url || "",
      body.thumbnail_url || null,
      body.size || null,
      body.duration || null,
      body.storage_key || null,
      nextSortOrder
    ) as Record<string, unknown>;
    return NextResponse.json(data);
  } catch (error) {
    console.error("POST /api/projects/[id]/assets error:", error);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }
}
