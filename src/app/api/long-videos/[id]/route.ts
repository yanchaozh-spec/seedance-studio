import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 获取单个长视频详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
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
      .eq("id", id)
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
      .eq("long_video_id", id)
      .order("segment_index");

    // 获取项目信息
    const { data: project } = await client
      .from("projects")
      .select("*")
      .eq("id", longVideo.project_id)
      .single();

    // 获取所有素材
    const assetIds = segments?.flatMap((s: { asset_ids: string[] }) => s.asset_ids || []) || [];
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
      segments: segments || [],
      project,
      assets,
    });
  } catch (error) {
    console.error("Get long video error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// 取消长视频任务
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!id) {
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
      .eq("id", id)
      .single();

    if (lvError || !longVideo) {
      return NextResponse.json(
        { error: "Long video not found" },
        { status: 404 }
      );
    }

    // 更新长视频状态
    await client
      .from("long_videos")
      .update({
        status: "failed",
        error_message: "Cancelled by user",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // 更新所有分段状态
    await client
      .from("video_segments")
      .update({
        status: "failed",
        error_message: "Cancelled",
        updated_at: new Date().toISOString(),
      })
      .eq("long_video_id", id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel long video error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
