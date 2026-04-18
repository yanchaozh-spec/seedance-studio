import { NextRequest, NextResponse } from "next/server";

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
    
    // 获取素材信息
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Missing Supabase config" }, { status: 500 });
    }
    
    const assetResponse = await fetch(
      `${supabaseUrl}/rest/v1/assets?id=eq.${id}&select=*`,
      {
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
        },
      }
    );
    
    if (!assetResponse.ok) {
      return NextResponse.json({ error: "Failed to fetch asset" }, { status: 500 });
    }
    
    const assets = await assetResponse.json();
    if (!assets || assets.length === 0) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }
    
    const asset = assets[0];
    
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
    
    // 返回文件
    return new NextResponse(blob, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${asset.name || "file"}.${ext}"`,
      },
    });
  } catch (error) {
    console.error("Download failed:", error);
    return NextResponse.json({ error: "Download failed" }, { status: 500 });
  }
}
