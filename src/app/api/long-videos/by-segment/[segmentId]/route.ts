import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 通过分段 ID 获取长视频信息
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ segmentId: string }> }
) {
  try {
    const { segmentId } = await params;

    if (!segmentId) {
      return NextResponse.json(
        { error: "Segment ID required" },
        { status: 400 }
      );
    }

    const client = getSupabaseClient();

    // 获取分段信息
    const { data: segment, error: segmentError } = await client
      .from("video_segments")
      .select("*")
      .eq("id", segmentId)
      .single();

    if (segmentError || !segment) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    // 获取长视频信息
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .select("*")
      .eq("id", segment.long_video_id)
      .single();

    if (lvError || !longVideo) {
      return NextResponse.json(
        { error: "Long video not found" },
        { status: 404 }
      );
    }

    // 获取所有分段
    const { data: allSegments } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", segment.long_video_id)
      .order("segment_index");

    // 获取项目信息
    const { data: project } = await client
      .from("projects")
      .select("*")
      .eq("id", longVideo.project_id)
      .single();

    // 获取素材信息
    const assetIds = allSegments?.flatMap((s: { asset_ids: string[] }) => s.asset_ids || []) || [];
    let assets: unknown[] = [];
    if (assetIds.length > 0) {
      const { data: assetsData } = await client
        .from("assets")
        .select("*")
        .in("id", assetIds);
      assets = assetsData || [];
    }

    return NextResponse.json({
      long_video: longVideo,
      segments: allSegments,
      project,
      assets,
    });
  } catch (error) {
    console.error("Get long video by segment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
