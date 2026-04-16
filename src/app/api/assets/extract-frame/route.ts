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

// POST /api/assets/extract-frame - 从视频提取帧并保存为素材
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const projectId = formData.get("projectId") as string;
    const taskId = formData.get("taskId") as string;
    const timestamp = formData.get("timestamp") as string; // 帧时间点（秒）
    const assetCategory = formData.get("assetCategory") as "keyframe" | "image" || "image";
    const name = formData.get("name") as string || `frame-${Date.now()}`;

    if (!file || !projectId) {
      return NextResponse.json(
        { error: "Missing required fields: file, projectId" },
        { status: 400 }
      );
    }

    const storage = getStorageClient();
    const client = getSupabaseClient();

    // 生成唯一文件名
    const fileName = `${projectId}/image/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    
    // 上传到存储
    const buffer = await file.arrayBuffer();
    const { data: uploadData, error: uploadError } = await storage.storage
      .from("materials")
      .upload(fileName, buffer, {
        contentType: "image/png",
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

    const imageUrl = urlData.publicUrl;

    console.log("Frame extracted and uploaded:", {
      url: imageUrl,
      projectId,
      taskId,
      timestamp,
      assetCategory,
    });

    // 创建素材记录
    const { data: asset, error: assetError } = await client
      .from("assets")
      .insert({
        project_id: projectId,
        name: name,
        display_name: name,
        type: "image",
        asset_category: assetCategory,
        url: imageUrl,
        thumbnail_url: imageUrl, // 抽帧图片本身作为缩略图
        keyframe_source_task_id: taskId || null,
        keyframe_description: timestamp ? `视频帧 @ ${timestamp}s` : null,
      })
      .select()
      .single();

    if (assetError) {
      console.error("Failed to create asset record:", assetError);
      return NextResponse.json({ error: assetError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      asset: asset,
      url: imageUrl,
    });
  } catch (error) {
    console.error("Extract frame error:", error);
    return NextResponse.json({ error: "Failed to extract frame" }, { status: 500 });
  }
}
