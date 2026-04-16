/**
 * FFmpeg 视频拼接工具
 * 用于将多个短视频片段拼接成长视频
 */

import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createClient } from "@supabase/supabase-js";

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

/**
 * 下载文件到本地
 */
async function downloadFile(url: string, localPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(localPath, buffer);
}

/**
 * 上传文件到 Supabase Storage
 */
async function uploadToStorage(localPath: string, storagePath: string): Promise<string> {
  const storage = getStorageClient();

  const fileBuffer = fs.readFileSync(localPath);
  const fileName = storagePath;

  const { data, error } = await storage.storage
    .from("materials")
    .upload(fileName, fileBuffer, {
      contentType: "video/mp4",
      upsert: true,
    });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  // 获取公开 URL
  const { data: urlData } = storage.storage
    .from("materials")
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

/**
 * 检查 FFmpeg 是否可用
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    await execAsync("ffmpeg -version");
    return true;
  } catch {
    return false;
  }
}

/**
 * 合并多个视频片段
 * @param videoUrls 视频 URL 数组
 * @param outputFilename 输出文件名
 * @returns 合并后视频的存储 URL
 */
export async function mergeVideos(
  videoUrls: string[],
  outputFilename: string
): Promise<{ url: string; duration: number }> {
  // 检查 FFmpeg 是否可用
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    throw new Error("FFmpeg is not installed on the server");
  }

  // 创建临时目录
  const tempDir = path.join(os.tmpdir(), `merge-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    console.log(`[mergeVideos] Starting merge for ${videoUrls.length} videos`);
    console.log(`[mergeVideos] Temp directory: ${tempDir}`);

    // 1. 下载所有视频到本地
    const localPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = path.join(tempDir, `segment_${i}.mp4`);
      console.log(`[mergeVideos] Downloading segment ${i + 1}/${videoUrls.length}...`);
      await downloadFile(videoUrls[i], localPath);
      localPaths.push(localPath);
    }

    // 2. 生成 concat 文件
    const concatFile = path.join(tempDir, "list.txt");
    const concatContent = localPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(concatFile, concatContent);
    console.log(`[mergeVideos] Generated concat file with ${localPaths.length} entries`);

    // 3. 执行 FFmpeg 拼接
    const outputPath = path.join(tempDir, outputFilename);
    console.log(`[mergeVideos] Starting FFmpeg concat...`);

    // 使用 concat demuxer 进行拼接
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}" -y`;
    const { stdout, stderr } = await execAsync(ffmpegCommand);

    if (stderr && stderr.includes("Error")) {
      console.error(`[mergeVideos] FFmpeg stderr: ${stderr}`);
    }

    console.log(`[mergeVideos] FFmpeg completed successfully`);

    // 4. 获取最终视频时长
    let totalDuration = 0;
    try {
      const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      const { stdout: durationOutput } = await execAsync(durationCommand);
      totalDuration = Math.round(parseFloat(durationOutput.trim()) || 0);
      console.log(`[mergeVideos] Total duration: ${totalDuration}s`);
    } catch (e) {
      console.warn(`[mergeVideos] Could not get duration: ${e}`);
    }

    // 5. 上传到对象存储
    console.log(`[mergeVideos] Uploading to storage...`);
    const storagePath = `long-videos/${outputFilename}`;
    const finalUrl = await uploadToStorage(outputPath, storagePath);

    console.log(`[mergeVideos] Uploaded to: ${finalUrl}`);

    return { url: finalUrl, duration: totalDuration };
  } finally {
    // 6. 清理临时文件
    console.log(`[mergeVideos] Cleaning up temp directory...`);
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/**
 * 合并视频（使用文本描述模式，适合不同编码的视频）
 * 这种方式会对所有视频进行重新编码
 */
export async function mergeVideosWithTranscode(
  videoUrls: string[],
  outputFilename: string
): Promise<{ url: string; duration: number }> {
  const ffmpegAvailable = await checkFFmpegAvailable();
  if (!ffmpegAvailable) {
    throw new Error("FFmpeg is not installed on the server");
  }

  const tempDir = path.join(os.tmpdir(), `merge-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    const localPaths: string[] = [];
    for (let i = 0; i < videoUrls.length; i++) {
      const localPath = path.join(tempDir, `segment_${i}.mp4`);
      await downloadFile(videoUrls[i], localPath);
      localPaths.push(localPath);
    }

    const concatFile = path.join(tempDir, "list.txt");
    const concatContent = localPaths.map((p) => `file '${p}'`).join("\n");
    fs.writeFileSync(concatFile, concatContent);

    const outputPath = path.join(tempDir, outputFilename);

    // 使用 libx264 重新编码
    const ffmpegCommand = `ffmpeg -f concat -safe 0 -i "${concatFile}" -c:v libx264 -c:a aac -strict experimental "${outputPath}" -y`;
    await execAsync(ffmpegCommand);

    let totalDuration = 0;
    try {
      const durationCommand = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputPath}"`;
      const { stdout } = await execAsync(durationCommand);
      totalDuration = Math.round(parseFloat(stdout.trim()) || 0);
    } catch {
      // ignore
    }

    const storagePath = `long-videos/${outputFilename}`;
    const finalUrl = await uploadToStorage(outputPath, storagePath);

    return { url: finalUrl, duration: totalDuration };
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}
