import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";

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

    const db = getDb();
    const asset = db.prepare("SELECT * FROM assets WHERE id = ?").get(id) as Record<string, unknown> | undefined;

    if (!asset) {
      return NextResponse.json({ error: "Asset not found" }, { status: 404 });
    }

    if (!asset.url) {
      return NextResponse.json({ error: "Asset has no URL" }, { status: 400 });
    }

    // 下载文件
    const fileResponse = await fetch(asset.url as string);

    if (!fileResponse.ok) {
      return NextResponse.json({ error: "Failed to download file" }, { status: 500 });
    }

    const blob = await fileResponse.blob();
    const contentType = fileResponse.headers.get("content-type") || "application/octet-stream";

    // 获取文件扩展名
    const urlParts = (asset.url as string).split(".");
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
