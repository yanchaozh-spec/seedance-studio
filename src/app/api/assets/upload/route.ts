import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminDb } from "@/storage/database/supabase-client";
import { uploadAsset, isTosConfigured } from "@/storage/tos/client";

// 获取存储客户端（Supabase Storage，作为备用）
function getSupabaseStorageClient() {
  const { createClient } = require("@supabase/supabase-js");
  const url = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    return null;
  }
  
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    let file: File;
    let projectId: string;
    let type: "image" | "audio" | "keyframe";

    // 检查是否是 multipart form data
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      file = formData.get("file") as File;
      projectId = formData.get("projectId") as string;
      type = formData.get("type") as "image" | "audio" | "keyframe";
    } else if (contentType.includes("application/json")) {
      // 如果是 JSON 格式（Coze 代理 URL）
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
    } else {
      return NextResponse.json({ error: "Unsupported content type" }, { status: 400 });
    }

    if (!file || !projectId || !type) {
      console.error("Missing fields:", { hasFile: !!file, projectId, type });
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    console.log("Uploading file:", {
      name: file.name,
      size: file.size,
      type: file.type,
      projectId,
      assetType: type,
      useTos: isTosConfigured(),
    });

    let url: string;
    let assetKey: string | null = null;

    // 优先使用 TOS，如果未配置则使用 Supabase Storage
    if (isTosConfigured()) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await uploadAsset(buffer, file.name, file.type || "application/octet-stream", projectId, type);
        url = result.url;
        assetKey = result.key;
        console.log("[TOS] Upload successful:", url);
      } catch (tosError) {
        console.error("[TOS] Upload failed, falling back to Supabase:", tosError);
        // TOS 上传失败，降级到 Supabase Storage
        url = await uploadToSupabase(file, projectId);
      }
    } else {
      console.log("[Supabase] TOS not configured, using Supabase Storage");
      url = await uploadToSupabase(file, projectId);
    }

    // 如果是图片，生成缩略图 URL（这里直接使用原图）
    const thumbnailUrl = type === "image" ? url : null;

    // 创建数据库记录
    let assetId: string | null = null;
    try {
      const supabaseAdmin = getSupabaseAdminDb();
      const assetCategory = type === "keyframe" ? "keyframe" : "image";
      
      const { data: assetData, error: assetError } = await supabaseAdmin
        .from("assets")
        .insert({
          project_id: projectId,
          name: file.name,
          type: type,
          asset_category: assetCategory,
          url: url,
          thumbnail_url: thumbnailUrl,
          size: file.size,
          storage_key: assetKey, // 存储 TOS key，方便后续管理
        })
        .select("id")
        .single();
      
      if (assetError) {
        console.error("Failed to create asset record:", assetError);
      } else {
        assetId = assetData.id;
        console.log("Asset record created:", assetId);
      }
    } catch (dbError) {
      console.error("Database error:", dbError);
    }

    console.log("Upload successful:", url);

    return NextResponse.json({
      id: assetId,
      url,
      thumbnailUrl,
      storageKey: assetKey,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}

/**
 * 上传到 Supabase Storage（降级方案）
 */
async function uploadToSupabase(file: File, projectId: string): Promise<string> {
  const storage = getSupabaseStorageClient();
  if (!storage) {
    throw new Error("Supabase Storage not configured");
  }
  
  // 生成唯一文件名
  const ext = file.name.split(".").pop() || "bin";
  const fileName = `${projectId}/materials/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  
  // 上传到存储
  const buffer = await file.arrayBuffer();
  const { data: uploadData, error: uploadError } = await storage.storage
    .from("materials")
    .upload(fileName, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Supabase upload error: ${uploadError.message}`);
  }

  // 获取公开 URL
  const { data: urlData } = storage.storage
    .from("materials")
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}
