import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/assets/[id]/download - 代理下载素材
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    if (!id) {
      return NextResponse.json({ error: "Missing asset id" }, { status: 400 });
    }
    
    // 使用 Supabase 客户端查询素材信息
    const client = getSupabaseClient();
    
    const { data: asset, error } = await client
      .from("assets")
      .select("*")
      .eq("id", id)
      .single();
    
    if (error || !asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    
    if (!asset.url) {
      return NextResponse.json({ error: "Asset has no URL" }, { status: 400 });
    }
    
    // 下载文件
    const fileResponse = await fetch(asset.url);
    
    if (!fileResponse.ok) {
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }
    
    const blob = await fileResponse.blob();
    const contentType = fileResponse.headers.get("content-type") || "application/octet-stream";
    
    // 获取文件扩展名
    const urlParts = asset.url.split(".");
    const ext = urlParts.length > 1 ? urlParts.pop() : "bin";
    const filename = `${asset.name || "file"}.${ext}`;
    
    // 返回文件
    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("Download failed:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
