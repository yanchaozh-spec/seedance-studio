import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { isUserTosConfigured } from "@/storage/tos/client";
import type { TosConfig } from "@/storage/tos/client";

const GLOBAL_AVATARS_KEY = "global-avatars/global-avatars.json";

function createS3ClientFromConfig(config: TosConfig) {
  let endpointUrl = config.endpoint || "";
  if (endpointUrl && !endpointUrl.startsWith("http://") && !endpointUrl.startsWith("https://")) {
    endpointUrl = "https://" + endpointUrl;
  }
  endpointUrl = endpointUrl.replace(".ivolces.com", ".volces.com");

  return new S3Client({
    region: process.env.COZE_TOS_REGION || "cn-beijing",
    endpoint: endpointUrl,
    credentials: {
      accessKeyId: config.accessKey!,
      secretAccessKey: config.secretKey!,
    },
  });
}

// POST /api/global-avatars/sync - 将本地数据上传到 TOS
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const config: TosConfig | undefined = body.tosConfig;

    if (!config || !isUserTosConfigured(config)) {
      return NextResponse.json({ error: "TOS not configured" }, { status: 400 });
    }

    const db = getDb();
    const avatars = db
      .prepare("SELECT * FROM global_avatars ORDER BY created_at DESC")
      .all() as Record<string, unknown>[];

    const jsonContent = JSON.stringify({
      version: 1,
      updated_at: new Date().toISOString(),
      avatars,
    });

    const s3Client = createS3ClientFromConfig(config);
    await s3Client.send(new PutObjectCommand({
      Bucket: config.bucket,
      Key: GLOBAL_AVATARS_KEY,
      Body: Buffer.from(jsonContent, "utf-8"),
      ContentType: "application/json",
    }));

    return NextResponse.json({ success: true, count: avatars.length });
  } catch (error) {
    console.error("POST /api/global-avatars/sync error:", error);
    return NextResponse.json({ error: "Failed to sync to TOS" }, { status: 500 });
  }
}

// GET /api/global-avatars/sync - 从 TOS 下载并合并到本地
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const configStr = url.searchParams.get("tosConfig");
    if (!configStr) {
      return NextResponse.json({ error: "TOS config required" }, { status: 400 });
    }

    let config: TosConfig;
    try {
      config = JSON.parse(configStr);
    } catch {
      return NextResponse.json({ error: "Invalid TOS config" }, { status: 400 });
    }

    if (!isUserTosConfigured(config)) {
      return NextResponse.json({ error: "TOS not configured" }, { status: 400 });
    }

    const s3Client = createS3ClientFromConfig(config);
    const response = await s3Client.send(new GetObjectCommand({
      Bucket: config.bucket,
      Key: GLOBAL_AVATARS_KEY,
    }));

    const bodyStr = await response.Body?.transformToString("utf-8");
    if (!bodyStr) {
      return NextResponse.json({ error: "No data in TOS" }, { status: 404 });
    }

    const data = JSON.parse(bodyStr) as {
      version: number;
      updated_at: string;
      avatars: Array<{
        asset_id: string;
        display_name?: string;
        thumbnail_url?: string;
        description?: string;
        source_project_id?: string;
      }>;
    };

    if (!data.avatars || !Array.isArray(data.avatars)) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    // 合并到本地数据库：TOS 数据作为基准，本地有则更新，无则插入
    const db = getDb();
    let synced = 0;

    for (const avatar of data.avatars) {
      if (!avatar.asset_id?.trim()) continue;

      const existing = db
        .prepare("SELECT id FROM global_avatars WHERE asset_id = ?")
        .get(avatar.asset_id.trim()) as { id: string } | undefined;

      if (existing) {
        // 本地已存在，仅更新 display_name 和 description（TOS 为准）
        db.prepare(`
          UPDATE global_avatars
          SET display_name = COALESCE(?, display_name),
              description = COALESCE(?, description),
              thumbnail_url = COALESCE(?, thumbnail_url),
              updated_at = datetime('now', 'localtime')
          WHERE asset_id = ?
        `).run(
          avatar.display_name || null,
          avatar.description || null,
          avatar.thumbnail_url || null,
          avatar.asset_id.trim()
        );
      } else {
        // 本地不存在，插入
        db.prepare(`
          INSERT INTO global_avatars (asset_id, display_name, thumbnail_url, description, source_project_id)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          avatar.asset_id.trim(),
          avatar.display_name || "",
          avatar.thumbnail_url || null,
          avatar.description || "",
          avatar.source_project_id || null
        );
      }
      synced++;
    }

    return NextResponse.json({ success: true, synced, total: data.avatars.length });
  } catch (error) {
    console.error("GET /api/global-avatars/sync error:", error);
    // 如果是 NoSuchKey 错误，说明 TOS 上还没有数据，返回空
    const errMsg = error instanceof Error ? error.message : String(error);
    if (errMsg.includes("NoSuchKey") || errMsg.includes("404") || errMsg.includes("NotFound")) {
      return NextResponse.json({ success: true, synced: 0, total: 0, message: "No remote data yet" });
    }
    return NextResponse.json({ error: "Failed to sync from TOS" }, { status: 500 });
  }
}
