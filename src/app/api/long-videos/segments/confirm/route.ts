import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 确认分段，传递尾帧给下一段
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { segment_id } = body;

    if (!segment_id) {
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
      .eq("id", segment_id)
      .single();

    if (segmentError || !segment) {
      return NextResponse.json(
        { error: "Segment not found" },
        { status: 404 }
      );
    }

    if (segment.status !== "waiting_confirm") {
      return NextResponse.json(
        { error: "Segment not in waiting_confirm status" },
        { status: 400 }
      );
    }

    // 更新分段状态为 confirmed
    await client
      .from("video_segments")
      .update({
        status: "confirmed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", segment_id);

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

    // 更新已完成分段数
    const newCompletedSegments = (longVideo.completed_segments || 0) + 1;
    const totalSegments = await getTotalSegments(client, segment.long_video_id);

    // 更新长视频进度
    const progress = totalSegments > 0 ? Math.round((newCompletedSegments / totalSegments) * 100) : 0;
    const updateData: Record<string, unknown> = {
      completed_segments: newCompletedSegments,
      progress,
      updated_at: new Date().toISOString(),
    };

    // 如果全部完成，更新状态
    if (newCompletedSegments >= totalSegments) {
      updateData.status = "waiting_merge";
    }

    await client
      .from("long_videos")
      .update(updateData)
      .eq("id", segment.long_video_id);

    // 如果尾帧URL存在，设置为下一段的首帧
    if (segment.last_frame_url) {
      const nextSegmentIndex = segment.segment_index + 1;
      if (nextSegmentIndex < totalSegments) {
        // 获取下一段
        const { data: nextSegment } = await client
          .from("video_segments")
          .select("*")
          .eq("long_video_id", segment.long_video_id)
          .eq("segment_index", nextSegmentIndex)
          .single();

        if (nextSegment && nextSegment.status === "pending") {
          // 将尾帧设置为下一段的首帧
          await client
            .from("video_segments")
            .update({
              first_frame_url: segment.last_frame_url,
              updated_at: new Date().toISOString(),
            })
            .eq("id", nextSegment.id);
        }
      }
    }

    // 获取更新后的长视频和分段信息
    const { data: updatedLongVideo } = await client
      .from("long_videos")
      .select("*")
      .eq("id", segment.long_video_id)
      .single();

    const { data: allSegments } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", segment.long_video_id)
      .order("segment_index");

    return NextResponse.json({
      long_video: updatedLongVideo,
      segments: allSegments,
    });
  } catch (error) {
    console.error("Confirm segment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

async function getTotalSegments(
  client: ReturnType<typeof getSupabaseClient>,
  longVideoId: string
): Promise<number> {
  const { count } = await client
    .from("video_segments")
    .select("*", { count: "exact", head: true })
    .eq("long_video_id", longVideoId);

  return count || 0;
}
