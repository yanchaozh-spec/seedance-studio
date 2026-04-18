import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { writeFile, mkdir } from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import os from "os";
import { uploadAsset, isTosConfigured, isUserTosConfigured, type TosConfig } from "@/storage/tos/client";

const execAsync = promisify(exec);

// POST /api/assets/extract-frame - 从视频提取帧并保存为素材
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";

    // 从请求头获取用户 TOS 配置
    let userTosConfig: TosConfig | null = null;
    const tosConfigHeader = request.headers.get("x-tos-config");
    if (tosConfigHeader) {
      try {
        userTosConfig = JSON.parse(Buffer.from(tosConfigHeader, "base64").toString());
      } catch (e) {
        console.error("[ExtractFrame] Failed to parse TOS config from header:", e);
      }
    }
    const useTos = isUserTosConfigured(userTosConfig) || isTosConfigured();

    // 判断是 JSON 还是 FormData
    if (contentType.includes("application/json")) {
      // JSON 格式：通过视频 URL 抽帧
      const body = await request.json();
      const { video_url, project_id, task_id, timestamp = 0, tos_config } = body;

      // 如果请求体中有 tos_config，优先使用
      if (tos_config) {
        userTosConfig = tos_config;
      }

      if (!video_url || !project_id) {
        return NextResponse.json(
          { error: "Missing required fields: video_url, project_id" },
          { status: 400 }
        );
      }

      return await extractFrameFromUrl(video_url, project_id, task_id, timestamp, userTosConfig);
    } else {
      // FormData 格式：直接上传图片
      const formData = await request.formData();
      const file = formData.get("file") as File;
      const projectId = formData.get("projectId") as string;
      const taskId = formData.get("taskId") as string;
      const timestamp = formData.get("timestamp") as string;
      const assetCategory = formData.get("assetCategory") as "keyframe" | "image" || "image";
      const name = formData.get("name") as string || `frame-${Date.now()}`;
      const tosConfigStr = formData.get("tos_config") as string | null;

      // 从 FormData 中解析 TOS 配置
      if (tosConfigStr) {
        try {
          userTosConfig = JSON.parse(tosConfigStr);
        } catch (e) {
          console.error("[ExtractFrame] Failed to parse tos_config from FormData:", e);
        }
      }

      // 重新检查 TOS 配置
      const canUseTos = isUserTosConfigured(userTosConfig) || isTosConfigured();

      if (!file || !projectId) {
        return NextResponse.json(
          { error: "Missing required fields: file, projectId" },
          { status: 400 }
        );
      }

      // 检查 TOS 是否配置
      if (!canUseTos) {
        return NextResponse.json(
          { error: "TOS not configured. Please set up TOS in settings or configure environment variables." },
          { status: 500 }
        );
      }

      const db = getDb();
      const buffer = Buffer.from(await file.arrayBuffer());

      // 上传到 TOS
      const result = await uploadAsset(
        buffer,
        file.name || "frame.png",
        "image/png",
        projectId,
        assetCategory === "keyframe" ? "keyframe" : "image",
        userTosConfig || undefined
      );

      const imageUrl = result.url;
      // 去除扩展名
      const displayName = name.replace(/\.[^/.]+$/, "");

      // 创建素材记录
      const asset = db.prepare(`
        INSERT INTO assets (project_id, name, display_name, type, asset_category, url, thumbnail_url, storage_key, keyframe_description)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        RETURNING *
      `).get(
        projectId,
        displayName,
        displayName,
        "image",
        assetCategory,
        imageUrl,
        imageUrl,
        result.key,
        timestamp ? `视频帧 @ ${timestamp}s` : null
      );

      return NextResponse.json({
        success: true,
        asset,
        url: imageUrl,
      });
    }
  } catch (error) {
    console.error("Extract frame error:", error);
    return NextResponse.json({ error: "Failed to extract frame" }, { status: 500 });
  }
}

// 通过视频 URL 抽帧
async function extractFrameFromUrl(videoUrl: string, projectId: string, taskId?: string, timestamp: number = 0, userConfig?: TosConfig | null) {
  const db = getDb();

  // 创建临时目录
  const tempDir = path.join(os.tmpdir(), `frame-extract-${Date.now()}`);
  await mkdir(tempDir, { recursive: true });

  const videoPath = path.join(tempDir, "input.mp4");
  const outputPath = path.join(tempDir, "frame.png");

  try {
    // 检查 TOS 是否配置
    if (!isUserTosConfigured(userConfig ?? null) && !isTosConfigured()) {
      throw new Error("TOS not configured. Please set up TOS in settings or configure environment variables.");
    }

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

    // 上传到 TOS
    const result = await uploadAsset(
      frameBuffer,
      `frame-${Date.now()}.png`,
      "image/png",
      projectId,
      "keyframe",
      userConfig || undefined
    );

    const imageUrl = result.url;
    const name = `关键帧_${Date.now()}`;

    console.log("Frame extracted and uploaded to TOS:", imageUrl);

    // 创建素材记录
    const asset = db.prepare(`
      INSERT INTO assets (project_id, name, display_name, type, asset_category, url, thumbnail_url, storage_key, keyframe_description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `).get(
      projectId,
      name,
      name,
      "image",
      "keyframe",
      imageUrl,
      imageUrl,
      result.key,
      `视频帧 @ ${timestamp}s`
    );

    // 更新任务的 last_frame_url
    if (taskId) {
      try {
        const task = db.prepare("SELECT result FROM tasks WHERE id = ?").get(taskId) as { result: string | null } | undefined;
        const taskResult = task?.result ? JSON.parse(task.result) : {};
        taskResult.last_frame_url = imageUrl;
        db.prepare("UPDATE tasks SET result = ? WHERE id = ?").run(JSON.stringify(taskResult), taskId);
      } catch (updateErr) {
        console.error("[ExtractFrame] Failed to update task last_frame_url:", updateErr);
      }
    }

    return NextResponse.json({
      success: true,
      asset,
      url: imageUrl,
    });
  } finally {
    // 清理临时目录
    try {
      const fs = await import("fs/promises");
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // 忽略清理错误
    }
  }
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms.toString().padStart(3, "0")}`;
}
