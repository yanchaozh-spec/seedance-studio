import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// DELETE /api/assets/[id] - 删除素材
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    const { error } = await client.from("assets").delete().eq("id", resolvedParams.id);

    if (error) throw new Error(`删除素材失败: ${error.message}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/assets/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete asset" }, { status: 500 });
  }
}

// PATCH /api/assets/[id] - 更新素材（如绑定音频）
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const updates = await request.json();
    
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("assets")
      .update(updates)
      .eq("id", resolvedParams.id)
      .select()
      .single();

    if (error) throw new Error(`更新素材失败: ${error.message}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error("PATCH /api/assets/[id] error:", error);
    return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
  }
}
