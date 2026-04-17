import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { createClient } from "@supabase/supabase-js";
import { writeFile, mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";

const execAsync = promisify(exec);

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
    const contentType = request.headers.get("content-type") || "";
    
    // 判断是 JSON 还是 FormData
    if (contentType.includes("application/json")) {
      // JSON 格式：通过视频 URL 抽帧
      const body = await request.json();
      const { video_url, project_id, task_id, timestamp = 0 } = body;
      
      if (!video_url || !project_id) {
        return NextResponse.json(
          { error: "Missing required fields: video_url, project_id" },
          { status: 400 }
        );
      }
      
      return await extractFrameFromUrl(video_url, project_id, task_id, timestamp);
    } else {
      // FormData 格式：直接上传图片
      const formData = await request.formData();
      const file = formData.get("file") as File;
      const projectId = formData.get("projectId") as string;
      const taskId = formData.get("taskId") as string;
      const timestamp = formData.get("timestamp") as string;
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
          thumbnail_url: imageUrl,
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
    }
  } catch (error) {
    console.error("Extract frame error:", error);
    return NextResponse.json({ error: "Failed to extract frame" }, { status: 500 });
  }
}

// 通过视频 URL 抽帧
async function extractFrameFromUrl(videoUrl: string, projectId: string, taskId?: string, timestamp: number = 0) {
  const storage = getStorageClient();
  const client = getSupabaseClient();
  
  // 创建临时目录
  const tempDir = path.join(os.tmpdir(), `frame-extract-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });
  
  const videoPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "frame.png");
  
  try {
    // 下载视频
    console.log("Downloading video from:", videoUrl);
    const videoResponse = await fetch(videoUrl);
    if (!videoResponse.ok) {
      throw new Error(`Failed to download video: ${videoResponse.status}`);
    }
    const videoBuffer = await videoResponse.arrayBuffer();
    await writeFile(videoPath, Buffer.from(videoBuffer));
    
    // 使用 ffmpeg 抽帧（从指定时间点提取）
    const timeStr = formatTime(timestamp);
    console.log(`Extracting frame at ${timeStr}...`);
    
    await execAsync(
      `ffmpeg -y -ss "${timeStr}" -i "${videoPath}" -vframes 1 -q:v 2 "${outputPath}" 2>&1`
    );
    
    // 读取抽帧图片
    const fs = await import("fs/promises");
    const frameBuffer = await fs.readFile(outputPath);
    
    // 上传到存储
    const fileName = `${projectId}/image/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
    const { data: uploadData, error: uploadError } = await storage.storage
      .from("materials")
      .upload(fileName, frameBuffer, {
        contentType: "image/png",
        upsert: true,
      });
    
    if (uploadError) {
      console.error("Upload error:", uploadError);
      throw new Error(uploadError.message);
    }
    
    // 获取公开 URL
    const { data: urlData } = storage.storage
      .from("materials")
      .getPublicUrl(fileName);
    
    const imageUrl = urlData.publicUrl;
    const name = `关键帧_${Date.now()}`;
    
    console.log("Frame extracted and uploaded:", imageUrl);
    
    // 创建素材记录
    const { data: asset, error: assetError } = await client
      .from("assets")
      .insert({
        project_id: projectId,
        name: name,
        display_name: name,
        type: "image",
        asset_category: "keyframe",
        url: imageUrl,
        thumbnail_url: imageUrl,
        keyframe_source_task_id: taskId || null,
        keyframe_description: timestamp ? `视频帧 @ ${timestamp}s` : null,
      })
      .select()
      .single();
    
    if (assetError) {
      console.error("Failed to create asset record:", assetError);
      throw new Error(assetError.message);
    }
    
    return NextResponse.json({
      success: true,
      asset: asset,
      url: imageUrl,
    });
  } finally {
    // 清理临时文件
    try {
      const fs = await import("fs/promises");
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (e) {
      console.error("Failed to cleanup temp files:", e);
    }
  }
}

// 格式化时间（秒转换为 HH:MM:SS.ms）
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 100);
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}
