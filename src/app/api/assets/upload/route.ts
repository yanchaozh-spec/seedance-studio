import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { createClient } from "@supabase/supabase-js";

// 获取存储客户端
function getStorageClient() {
  const url = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !key) {
    throw new Error("Storage credentials not configured");
  }
  
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;
    const type = formData.get("type") as "image" | "audio";

    if (!file || !projectId || !type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const storage = getStorageClient();
    
    // 生成唯一文件名
    const ext = file.name.split(".").pop();
    const fileName = `${projectId}/${type}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    
    // 上传到存储
    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await storage.storage
      .from("materials")
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 获取公开 URL
    const { data: urlData } = storage.storage
      .from("materials")
      .getPublicUrl(fileName);

    // 如果是图片，生成缩略图 URL（这里直接使用原图，实际可以调用图片处理服务）
    const thumbnailUrl = type === "image" ? urlData.publicUrl : null;

    // 如果是音频，获取时长（需要前端通过 audio 元素获取）
    const duration = type === "audio" ? null : null;

    return NextResponse.json({
      url: urlData.publicUrl,
      thumbnailUrl,
      duration,
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
