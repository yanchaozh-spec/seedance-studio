import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// 更新分段
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: segmentId } = await params;

    if (!segmentId) {
      return NextResponse.json(
        { error: "Segment ID required" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const {
      prompts,
      selectedAssets,
      duration,
      ratio,
      resolution,
      generateAudio,
      first_frame_url,
    } = body;

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

    // 检查是否可以更新
    if (segment.status === "running") {
      return NextResponse.json(
        { error: "Cannot update segment while running" },
        { status: 400 }
      );
    }

    // 构建更新数据
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (prompts !== undefined) {
      const promptContent = Array.isArray(prompts)
        ? prompts.map((p: { content: string; order?: number }, index: number) => ({
            content: p.content || "",
            order: p.order ?? index,
          }))
        : [];
      updateData.prompt_content = promptContent;
    }

    if (selectedAssets !== undefined) {
      updateData.asset_ids = selectedAssets;
    }

    if (duration !== undefined) {
      updateData.segment_duration = duration;
    }

    if (ratio !== undefined) {
      updateData.segment_ratio = ratio;
    }

    if (resolution !== undefined) {
      updateData.segment_resolution = resolution;
    }

    if (generateAudio !== undefined) {
      updateData.segment_generate_audio = generateAudio;
    }

    if (first_frame_url !== undefined) {
      updateData.first_frame_url = first_frame_url;
    }

    // 重置状态为 pending
    if (segment.status !== "pending") {
      updateData.status = "pending";
      updateData.video_url = null;
      updateData.error_message = null;
    }

    // 更新分段
    const { data: updatedSegment, error: updateError } = await client
      .from("video_segments")
      .update(updateData)
      .eq("id", segmentId)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update segment:", updateError);
      return NextResponse.json(
        { error: "Failed to update segment" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      segment: updatedSegment,
    });
  } catch (error) {
    console.error("Update segment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// 删除分段
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: segmentId } = await params;

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

    // 检查是否可以删除
    if (segment.status === "running") {
      return NextResponse.json(
        { error: "Cannot delete segment while running" },
        { status: 400 }
      );
    }

    const longVideoId = segment.long_video_id;
    const deletedIndex = segment.segment_index;

    // 删除分段
    await client
      .from("video_segments")
      .delete()
      .eq("id", segmentId);

    // 重新编号后续分段
    await client
      .from("video_segments")
      .update({
        segment_index: client.rpc("minus_one", { current_index: deletedIndex }),
        updated_at: new Date().toISOString(),
      })
      .eq("long_video_id", longVideoId)
      .gte("segment_index", deletedIndex + 1);

    // 获取更新后的所有分段
    const { data: allSegments } = await client
      .from("video_segments")
      .select("*")
      .eq("long_video_id", longVideoId)
      .order("segment_index");

    // 检查是否还有分段，如果没有则删除长视频
    if (!allSegments || allSegments.length === 0) {
      await client
        .from("long_videos")
        .delete()
        .eq("id", longVideoId);

      return NextResponse.json({
        deleted: true,
        long_video_deleted: true,
      });
    }

    return NextResponse.json({
      deleted: true,
      segments: allSegments,
    });
  } catch (error) {
    console.error("Delete segment error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
