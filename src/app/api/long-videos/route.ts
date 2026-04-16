import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { mergeVideos } from "@/lib/merge-videos";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MODEL_ID = "doubao-seedance-2-0-260128";
const SEGMENT_DURATION = 15; // 每段最大时长（秒）

interface CreateLongVideoRequest {
  project_id: string;
  prompts: Array<{
    id: string;
    content: string;
    is_activated: boolean;
    activated_asset_id?: string;
    keyframe_description?: string;
    order: number;
  }>;
  selected_assets: string[];
  params: {
    target_duration: number; // 目标时长（秒）
    ratio: string;
    resolution: string;
    generate_audio: boolean;
  };
}

// Content item 类型定义
type ContentItem =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string }; role?: string }
  | { type: "video_url"; video_url: { url: string }; role?: string }
  | { type: "audio_url"; audio_url: { url: string }; role?: string };

// 构建符合 Seedance 2.0 格式的提示词
// 格式：第一行素材引用，第二行提示词内容
function buildPrompt(
  boxContent: string,
  asset: {
    display_name: string;
    name: string;
    type: string;
    asset_category?: string;
    bound_audio_id?: string;
    keyframe_description?: string;
  } | null,
  keyframeDesc?: string,
  audioAssets?: Array<{ id: string; name: string; display_name?: string }>
): string {
  if (!asset) return boxContent;

  const displayName = asset.display_name || asset.name;
  const isKeyframe = asset.asset_category === "keyframe";
  let assetLine = "";

  if (isKeyframe) {
    // 关键帧：关键帧描述@文件名
    const desc = keyframeDesc || asset.keyframe_description || "";
    if (desc) {
      assetLine = `${desc}@${displayName}`;
    } else {
      assetLine = `@${displayName}`;
    }
  } else {
    // 美术资产："图片名"@这张图片，声线为@音频文件名
    assetLine = `"${displayName}"@这张图片`;

    if (asset.bound_audio_id && audioAssets) {
      const boundAudio = audioAssets.find((a) => a.id === asset.bound_audio_id);
      if (boundAudio) {
        const audioName = boundAudio.display_name || boundAudio.name;
        assetLine += `，声线为@${audioName}`;
      }
    }
  }

  // 第一行素材引用，第二行提示词内容
  if (boxContent) {
    return `${assetLine}\n${boxContent}`;
  }
  return assetLine;
}

// 计算需要多少段
function calculateSegments(targetDuration: number): number {
  return Math.ceil(targetDuration / SEGMENT_DURATION);
}

// 轮询任务状态
async function pollTaskStatus(
  taskId: string,
  apiKey: string,
  maxAttempts = 200,
  interval = 3000
): Promise<{ status: string; video_url?: string; last_frame_url?: string; error?: string }> {
  for (let i = 0; i < maxAttempts; i++) {
    const response = await fetch(`${ARK_API_URL}/contents/generations/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return { status: "failed", error: data.error?.message || "API request failed" };
    }

    if (data.status === "succeeded") {
      return {
        status: "succeeded",
        video_url: data.content?.video_url,
        last_frame_url: data.content?.last_frame_url,
      };
    }

    if (data.status === "failed") {
      return { status: "failed", error: data.error?.message || "Generation failed" };
    }

    // 等待一段时间后再检查
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  return { status: "failed", error: "Polling timeout" };
}

// 处理长视频生成（分段生成 + 拼接）
async function processLongVideo(longVideoId: string): Promise<void> {
  const client = getSupabaseClient();
  const apiKey = process.env.ARK_API_KEY;

  if (!apiKey) {
    await client
      .from("long_videos")
      .update({ status: "failed", error_message: "ARK API Key not configured" })
      .eq("id", longVideoId);
    return;
  }

  try {
    // 获取长视频信息
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .select("*")
      .eq("id", longVideoId)
      .single();

    if (lvError || !longVideo) {
      console.error("Failed to fetch long video:", lvError);
      return;
    }

    // 获取素材
    const { data: assets, error: assetsError } = await client
      .from("assets")
      .select("*")
      .in("id", longVideo.selected_assets || []);

    if (assetsError) {
      await client
        .from("long_videos")
        .update({ status: "failed", error_message: "Failed to fetch assets" })
        .eq("id", longVideoId);
      return;
    }

    // 如果有图片绑定了音频，也需要获取这些音频素材
    let allAssets = assets || [];
    const boundAudioIds = (assets || [])
      .filter((a) => (a.type === "image" || a.type === "keyframe") && a.bound_audio_id)
      .map((a) => a.bound_audio_id)
      .filter((id): id is string => !!id) || [];

    if (boundAudioIds.length > 0) {
      const { data: boundAudios } = await client
        .from("assets")
        .select("*")
        .in("id", boundAudioIds);
      
      if (boundAudios && boundAudios.length > 0) {
        allAssets = [...allAssets, ...boundAudios.filter(b => !allAssets.some(a => a.id === b.id))];
      }
    }

    // 分类素材
    const imageAssets = allAssets.filter((a) => a.type === "image");
    const keyframeAssets = allAssets.filter((a) => a.type === "keyframe" || a.is_keyframe);
    const audioAssets = allAssets.filter((a) => a.type === "audio");

    // 获取所有分段
    const { data: segments, error: segmentsError } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", longVideoId)
      .order("segment_index", { ascending: true });

    if (segmentsError || !segments) {
      console.error("Failed to fetch segments:", segmentsError);
      return;
    }

    // 更新状态为生成中
    await client
      .from("long_videos")
      .update({ status: "generating", updated_at: new Date().toISOString() })
      .eq("id", longVideoId);

    const videoUrls: string[] = [];
    let lastFrameUrl: string | null = null;

    // 逐段生成视频
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      console.log(`[LongVideo] Processing segment ${i + 1}/${segments.length}`);

      // 更新分段状态
      await client
        .from("video_segments")
        .update({ status: "queued", updated_at: new Date().toISOString() })
        .eq("id", segment.id);

      // 找到该段对应的 prompt
      const sortedPrompts = (longVideo.prompts || [])
        .filter((p: { content: string }) => p.content?.trim())
        .sort((a: { order: number }, b: { order: number }) => a.order - b.order);

      // 将 prompts 分配给各段
      const promptIndex = Math.min(i, sortedPrompts.length - 1);
      const prompt = sortedPrompts[promptIndex] || sortedPrompts[0];

      if (!prompt) {
        console.warn(`[LongVideo] No prompt for segment ${i}`);
        continue;
      }

      // 找到激活的素材
      let activatedAsset = null;
      if (prompt.activated_asset_id) {
        activatedAsset = allAssets.find((a) => a.id === prompt.activated_asset_id);
      }

      // 如果没有指定，使用第一个可用的图片或关键帧
      if (!activatedAsset) {
        activatedAsset = imageAssets[0] || keyframeAssets[0] || null;
      }

      // 构建 content 数组
      const content: ContentItem[] = [];

      // 添加首帧图片（如果是第一段之后，需要使用上一段的尾帧）
      if (lastFrameUrl && i > 0) {
        content.push({
          type: "image_url",
          image_url: { url: lastFrameUrl },
          role: "first_frame",
        });
      } else if (activatedAsset && (activatedAsset.type === "image" || activatedAsset.type === "keyframe")) {
        content.push({
          type: "image_url",
          image_url: { url: activatedAsset.url },
          role: "first_frame",
        });
      }

      // 构建提示词文本
      const promptText = buildPrompt(
        prompt.content.trim(),
        activatedAsset || null,
        prompt.keyframe_description,
        audioAssets
      );

      content.push({
        type: "text",
        text: promptText,
      });

      // 调用 Seedance API
      const requestBody = {
        model: MODEL_ID,
        content,
        generate_audio: longVideo.params?.generate_audio ?? true,
        ratio: longVideo.params?.ratio || "16:9",
        duration: SEGMENT_DURATION,
        resolution: longVideo.params?.resolution || "720p",
        watermark: false,
        return_last_frame: true, // 重要：获取尾帧用于连接下一段
      };

      console.log(`[LongVideo] Creating task for segment ${i + 1}...`);

      const apiResponse = await fetch(`${ARK_API_URL}/contents/generations/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      const apiData = await apiResponse.json();

      if (!apiResponse.ok) {
        console.error(`[LongVideo] API error for segment ${i + 1}:`, apiData);
        await client
          .from("video_segments")
          .update({ status: "failed", error_message: apiData.error?.message || "API error", updated_at: new Date().toISOString() })
          .eq("id", segment.id);

        await client
          .from("long_videos")
          .update({ status: "failed", error_message: `Segment ${i + 1} failed: ${apiData.error?.message || "API error"}`, updated_at: new Date().toISOString() })
          .eq("id", longVideoId);
        return;
      }

      const taskId = apiData.id;

      // 保存 task_id
      await client
        .from("video_segments")
        .update({ task_id: taskId, status: "running", updated_at: new Date().toISOString() })
        .eq("id", segment.id);

      // 轮询任务状态
      console.log(`[LongVideo] Polling segment ${i + 1} task ${taskId}...`);
      const result = await pollTaskStatus(taskId, apiKey);

      if (result.status === "succeeded" && result.video_url) {
        await client
          .from("video_segments")
          .update({
            status: "succeeded",
            video_url: result.video_url,
            last_frame_url: result.last_frame_url,
            updated_at: new Date().toISOString(),
          })
          .eq("id", segment.id);

        videoUrls.push(result.video_url);
        lastFrameUrl = result.last_frame_url || null;

        // 更新进度
        await client
          .from("long_videos")
          .update({
            completed_segments: i + 1,
            progress: Math.round(((i + 1) / segments.length) * 100),
            updated_at: new Date().toISOString(),
          })
          .eq("id", longVideoId);
      } else {
        await client
          .from("video_segments")
          .update({
            status: "failed",
            error_message: result.error,
            updated_at: new Date().toISOString(),
          })
          .eq("id", segment.id);

        await client
          .from("long_videos")
          .update({
            status: "failed",
            error_message: `Segment ${i + 1} failed: ${result.error}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", longVideoId);
        return;
      }
    }

    // 所有段都生成完成，开始拼接
    console.log(`[LongVideo] All segments generated, starting merge...`);
    await client
      .from("long_videos")
      .update({ status: "merging", progress: 90, updated_at: new Date().toISOString() })
      .eq("id", longVideoId);

    try {
      const outputFilename = `long-video-${longVideoId}-${Date.now()}.mp4`;
      const mergeResult = await mergeVideos(videoUrls, outputFilename);

      // 更新最终结果
      await client
        .from("long_videos")
        .update({
          status: "succeeded",
          progress: 100,
          final_video_url: mergeResult.url,
          final_video_duration: mergeResult.duration,
          updated_at: new Date().toISOString(),
        })
        .eq("id", longVideoId);

      console.log(`[LongVideo] Merge completed: ${mergeResult.url}`);
    } catch (mergeError) {
      console.error(`[LongVideo] Merge failed:`, mergeError);
      await client
        .from("long_videos")
        .update({
          status: "failed",
          error_message: `Merge failed: ${mergeError instanceof Error ? mergeError.message : "Unknown error"}`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", longVideoId);
    }
  } catch (error) {
    console.error(`[LongVideo] Process error:`, error);
    await client
      .from("long_videos")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Unknown error",
        updated_at: new Date().toISOString(),
      })
      .eq("id", longVideoId);
  }
}

// 创建长视频任务
export async function POST(request: NextRequest) {
  try {
    const body: CreateLongVideoRequest = await request.json();
    const { project_id, prompts, selected_assets, params } = body;

    // 验证目标时长
    const targetDuration = params.target_duration || 60;
    if (targetDuration > 60) {
      return NextResponse.json({ error: "Maximum duration is 60 seconds" }, { status: 400 });
    }

    // 计算分段数
    const totalSegments = calculateSegments(targetDuration);
    console.log(`[LongVideo] Creating long video: ${targetDuration}s, ${totalSegments} segments`);

    const client = getSupabaseClient();

    // 创建长视频记录
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .insert({
        project_id,
        status: "pending",
        progress: 0,
        total_segments: totalSegments,
        completed_segments: 0,
        target_duration: targetDuration,
        prompts,
        selected_assets,
        params: {
          ratio: params.ratio,
          resolution: params.resolution,
          generate_audio: params.generate_audio ?? true,
        },
      })
      .select()
      .single();

    if (lvError || !longVideo) {
      console.error("Failed to create long video:", lvError);
      return NextResponse.json({ error: "Failed to create long video" }, { status: 500 });
    }

    // 创建分段记录
    const segmentsToInsert = Array.from({ length: totalSegments }, (_, i) => ({
      long_video_id: longVideo.id,
      segment_index: i,
      status: "pending",
      prompt_content: prompts[i % prompts.length] || prompts[0],
    }));

    const { error: segmentsError } = await client
      .from("video_segments")
      .insert(segmentsToInsert);

    if (segmentsError) {
      console.error("Failed to create segments:", segmentsError);
      // 删除已创建的长视频记录
      await client.from("long_videos").delete().eq("id", longVideo.id);
      return NextResponse.json({ error: "Failed to create segments" }, { status: 500 });
    }

    // 异步开始处理长视频（不阻塞响应）
    processLongVideo(longVideo.id).catch((error) => {
      console.error("[LongVideo] Async process error:", error);
    });

    return NextResponse.json({
      id: longVideo.id,
      status: "pending",
      total_segments: totalSegments,
      target_duration: targetDuration,
    });
  } catch (error) {
    console.error("Create long video error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 获取长视频列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("project_id");

    if (!projectId) {
      return NextResponse.json({ error: "Project ID required" }, { status: 400 });
    }

    const client = getSupabaseClient();

    const { data: longVideos, error } = await client
      .from("long_videos")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: "Failed to fetch long videos" }, { status: 500 });
    }

    return NextResponse.json(longVideos || []);
  } catch (error) {
    console.error("Get long videos error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
