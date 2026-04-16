import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 创建长视频项目（不生成视频）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { project_id, segments } = body;

    if (!project_id || !segments || !Array.isArray(segments)) {
      return NextResponse.json(
        { error: "Invalid parameters" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 创建长视频记录
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .insert({
        project_id,
        status: "pending",
        progress: 0,
        completed_segments: 0,
      })
      .select()
      .single();

    if (lvError || !longVideo) {
      console.error("Failed to create long video:", lvError);
      return NextResponse.json(
        { error: "Failed to create long video" },
        { status: 500 }
      );
    }

    // 创建分段记录
    const segmentsToInsert = segments.map((segment, index) => ({
      long_video_id: longVideo.id,
      segment_index: index,
      status: "pending",
      prompt_content: segment.prompts || [],
      asset_ids: segment.selectedAssets || [],
      segment_duration: segment.duration || 5,
      segment_ratio: segment.ratio || "16:9",
      segment_resolution: segment.resolution || "720p",
      segment_generate_audio: segment.generateAudio ?? true,
      first_frame_url: segment.firstFrameUrl || null,
    }));

    const { data: createdSegments, error: segmentsError } = await client
      .from("video_segments")
      .insert(segmentsToInsert)
      .select();

    if (segmentsError) {
      console.error("Failed to create segments:", segmentsError);
      // 删除已创建的长视频记录
      await client.from("long_videos").delete().eq("id", longVideo.id);
      return NextResponse.json(
        { error: "Failed to create segments" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      id: longVideo.id,
      segments: createdSegments,
    });
  } catch (error) {
    console.error("Create long video project error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
