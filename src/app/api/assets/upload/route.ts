import { NextRequest, NextResponse } from "next/server";
import { getDb, parseJsonField } from "@/storage/database/sqlite-client";
import { uploadAsset, isUserTosConfigured, isTosConfigured } from "@/storage/tos/client";

// TOS 配置类型
interface TosConfig {
  endpoint?: string;
  accessKey?: string;
  secretKey?: string;
  bucket?: string;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let file: File;
    let projectId: string;
    let type: "image" | "audio" | "video" | "keyframe";
    let userTosConfig: TosConfig | null = null;

    // 检查是否是 multipart form data
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      file = formData.get("file") as File;
      projectId = formData.get("projectId") as string;
      type = formData.get("type") as "image" | "audio" | "video" | "keyframe";

      // 从表单获取 TOS 配置（JSON 字符串）
      const tosConfigStr = formData.get("tosConfig") as string;
      if (tosConfigStr) {
        try {
          userTosConfig = JSON.parse(tosConfigStr);
        } catch {
          console.error("Failed to parse tosConfig");
        }
      }
    } else if (contentType.includes("application/json")) {
      // 如果是 JSON 格式
      const body = await request.json();

      // 如果 file 是字符串（可能是 URL），需要下载它
      if (typeof body.file === "string") {
        const fileUrl = body.file;
        console.log("Downloading file from URL:", fileUrl);

        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
          throw new Error(`Failed to download file: ${fileResponse.statusText}`);
        }

        const blob = await fileResponse.blob();
        const fileName = body.fileName || `upload_${Date.now()}`;
        file = new File([blob], fileName, { type: blob.type || "application/octet-stream" });
      } else {
        file = body.file;
      }

      projectId = body.projectId;
      type = body.type;
      userTosConfig = body.tosConfig || null;
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    if (!file || !projectId || !type) {
      console.error("Missing fields:", { hasFile: !!file, projectId, type });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 检查 TOS 配置
    const hasUserConfig = isUserTosConfigured(userTosConfig);
    const hasEnvConfig = isTosConfigured();

    if (!hasUserConfig && !hasEnvConfig) {
      return NextResponse.json({
        error: "TOS not configured. Please set up TOS in settings or configure environment variables."
      }, { status: 500 });
    }

    console.log("Uploading file to TOS:", {
      name: file.name,
      size: file.size,
      type: file.type,
      projectId,
      assetType: type,
      useUserConfig: hasUserConfig,
    });

    // 上传到 TOS
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAsset(
      buffer,
      file.name,
      file.type || "application/octet-stream",
      projectId,
      type,
      userTosConfig || undefined
    );

    console.log("[TOS] Upload successful:", result.url);

    // 如果是图片，使用原始 URL 作为缩略图；视频缩略图由前端截帧后单独上传
    const thumbnailUrl = type === "image" ? result.url : null;

    // 去除文件名扩展名，用于显示
    const fileNameWithoutExt = file.name.replace(/\.[^/.]+$/, "");

    // 创建数据库记录
    let assetId: string | null = null;
    try {
      const db = getDb();
      const assetCategory = type === "keyframe" ? "keyframe" : type === "video" ? "video" : "image";

      const row = db.prepare(`
        INSERT INTO assets (project_id, name, type, asset_category, url, thumbnail_url, size, storage_key)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING id
      `).get(
        projectId,
        fileNameWithoutExt,
        type,
        assetCategory,
        result.url,
        thumbnailUrl,
        file.size,
        result.key
      ) as { id: string } | undefined;
      assetId = row?.id || null;
      console.log("Asset record created:", assetId);
    } catch (dbError) {
      console.error("Database error:", dbError);
    }

    return NextResponse.json({
      id: assetId,
      url: result.url,
      thumbnailUrl,
      storageKey: result.key,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
