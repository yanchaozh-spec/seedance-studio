import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 添加分段
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: longVideoId } = await params;

    if (!longVideoId) {
      return NextResponse.json(
        { error: "Long video ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { prompts, selectedAssets, duration, ratio, resolution, generateAudio } = body;

    const client = getSupabaseClient();

    // 获取长视频信息
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .select("*")
      .eq("id", longVideoId)
      .single();

    if (lvError || !longVideo) {
      return NextResponse.json(
        { error: "Long video not found" },
        { status: 404 }
      );
    }

    // 检查是否可以添加分段
    if (!["pending", "waiting_merge"].includes(longVideo.status)) {
      return NextResponse.json(
        { error: "Cannot add segment in current status" },
        { status: 400 }
      );
    }

    // 获取当前最大分段索引
    const { data: existingSegments } = await client
      .from("video_segments")
      .select("segment_index")
      .eq("long_video_id", longVideoId)
      .order("segment_index", { ascending: false })
      .limit(1);

    const nextIndex = existingSegments && existingSegments.length > 0
      ? (existingSegments[0] as { segment_index: number }).segment_index + 1
      : 0;

    // 获取上一段的尾帧作为当前段的首帧
    let firstFrameUrl = null;
    if (nextIndex > 0) {
      const { data: previousSegment } = await client
        .from("video_segments")
        .select("last_frame_url")
        .eq("long_video_id", longVideoId)
        .eq("segment_index", nextIndex - 1)
        .single();

      if (previousSegment) {
        firstFrameUrl = (previousSegment as { last_frame_url?: string }).last_frame_url;
      }
    }

    // 构建提示词数据
    const promptContent = Array.isArray(prompts)
      ? prompts.map((p: { content: string; order?: number }, index: number) => ({
          content: p.content || "",
          order: p.order ?? index,
        }))
      : [];

    // 创建新分段
    const { data: newSegment, error: segmentError } = await client
      .from("video_segments")
      .insert({
        long_video_id: longVideoId,
        segment_index: nextIndex,
        status: "pending",
        prompt_content: promptContent,
        asset_ids: selectedAssets || [],
        segment_duration: duration || 5,
        segment_ratio: ratio || "16:9",
        segment_resolution: resolution || "720p",
        segment_generate_audio: generateAudio ?? true,
        first_frame_url: firstFrameUrl,
      })
      .select()
      .single();

    if (segmentError || !newSegment) {
      console.error("Failed to create segment:", segmentError);
      return NextResponse.json(
        { error: "Failed to create segment" },
        { status: 500 }
      );
    }

    // 获取所有分段
    const { data: allSegments } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", longVideoId)
      .order("segment_index");

    return NextResponse.json({
      segment: newSegment,
      segments: allSegments,
    });
  } catch (error) {
    console.error("Add segment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// 获取长视频的所有分段
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: longVideoId } = await params;

    if (!longVideoId) {
      return NextResponse.json(
        { error: "Long video ID required" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 获取长视频信息
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .select("*")
      .eq("id", longVideoId)
      .single();

    if (lvError || !longVideo) {
      return NextResponse.json(
        { error: "Long video not found" },
        { status: 404 }
      );
    }

    // 获取所有分段
    const { data: segments } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", longVideoId)
      .order("segment_index");

    return NextResponse.json({
      long_video: longVideo,
      segments: segments || [],
    });
  } catch (error) {
    console.error("Get segments error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
