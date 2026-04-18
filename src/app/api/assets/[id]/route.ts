import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { deleteFile, isTosConfigured } from "@/storage/tos/client";

// DELETE /api/assets/[id] - 删除素材
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    
    // 先获取素材信息，包括 storage_key
    const { data: asset, error: fetchError } = await client
      .from("assets")
      .select("storage_key")
      .eq("id", resolvedParams.id)
      .maybeSingle();
    
    if (fetchError) {
      console.error("Failed to fetch asset:", fetchError);
    }
    
    // 如果 TOS 已配置且有 storage_key，先删除 TOS 文件
    if (isTosConfigured() && asset?.storage_key) {
      try {
        await deleteFile(asset.storage_key);
        console.log("[TOS] Deleted file:", asset.storage_key);
      } catch (deleteError) {
        console.error("[TOS] Failed to delete file:", deleteError);
        // 继续删除数据库记录，不阻塞删除流程
      }
    }
    
    // 删除数据库记录
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
