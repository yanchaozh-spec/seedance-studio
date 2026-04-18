import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminDb } from "@/storage/database/supabase-client";
import { uploadAsset, isTosConfigured } from "@/storage/tos/client";

export async function POST(request: NextRequest) {
  try {
    // 检查 TOS 是否配置
    if (!isTosConfigured()) {
      return NextResponse.json({ 
        error: "TOS not configured. Please set COZE_TOS_* environment variables." 
      }, { status: 500 });
    }

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

    console.log("Uploading file to TOS:", {
      name: file.name,
      size: file.size,
      type: file.type,
      projectId,
      assetType: type,
    });

    // 上传到 TOS
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadAsset(buffer, file.name, file.type || "application/octet-stream", projectId, type);
    
    console.log("[TOS] Upload successful:", result.url);

    // 如果是图片，生成缩略图 URL（这里直接使用原图）
    const thumbnailUrl = type === "image" ? result.url : null;

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
          url: result.url,
          thumbnail_url: thumbnailUrl,
          size: file.size,
          storage_key: result.key, // 存储 TOS key
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
