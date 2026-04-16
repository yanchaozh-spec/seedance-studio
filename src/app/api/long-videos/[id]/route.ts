import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";

// 获取单个长视频详情
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const client = getSupabaseClient();

    // 获取长视频信息
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .select("*")
      .eq("id", id)
      .single();

    if (lvError || !longVideo) {
      return NextResponse.json({ error: "Long video not found" }, { status: 404 });
    }

    // 获取分段信息
    const { data: segments, error: segmentsError } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", id)
      .order("segment_index", { ascending: true });

    if (segmentsError) {
      console.error("Failed to fetch segments:", segmentsError);
    }

    return NextResponse.json({
      ...longVideo,
      segments: segments || [],
    });
  } catch (error) {
    console.error("Get long video error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 取消长视频任务
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const apiKey = process.env.ARK_API_KEY;

    const client = getSupabaseClient();

    // 获取长视频信息
    const { data: longVideo, error: lvError } = await client
      .from("long_videos")
      .select("*")
      .eq("id", id)
      .single();

    if (lvError || !longVideo) {
      return NextResponse.json({ error: "Long video not found" }, { status: 404 });
    }

    // 如果任务已完成或已失败，不允许取消
    if (longVideo.status === "succeeded" || longVideo.status === "failed") {
      return NextResponse.json({ error: "Cannot cancel completed or failed task" }, { status: 400 });
    }

    // 获取所有待处理或运行中的分段
    const { data: activeSegments, error: segmentsError } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", id)
      .in("status", ["pending", "queued", "running"]);

    if (segmentsError) {
      console.error("Failed to fetch active segments:", segmentsError);
    }

    // 尝试取消 API 任务
    if (apiKey && activeSegments) {
      for (const segment of activeSegments) {
        if (segment.task_id) {
          try {
            // 调用取消 API
            await fetch(`${ARK_API_URL}/contents/generations/tasks/${segment.task_id}/cancel`, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${apiKey}`,
              },
            });
          } catch (e) {
            console.warn(`Failed to cancel task ${segment.task_id}:`, e);
          }
        }
      }
    }

    // 更新长视频状态为失败（用户取消）
    await client
      .from("long_videos")
      .update({
        status: "failed",
        error_message: "Cancelled by user",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    // 更新所有活跃分段状态
    await client
      .from("video_segments")
      .update({
        status: "failed",
        error_message: "Cancelled by user",
        updated_at: new Date().toISOString(),
      })
      .eq("long_video_id", id)
      .in("status", ["pending", "queued", "running"]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Cancel long video error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
