import { NextRequest, NextResponse } from "next/server";
import { uploadAsset, isUserTosConfigured, isTosConfigured } from "@/storage/tos/client";

/**
 * POST /api/assets/transfer-url
 * 从外部 URL 下载图片并转存到 TOS，返回永久 URL
 * 用于解决火山方舟等平台返回的预签名 URL 过期问题
 */
export async function POST(request: NextRequest) {
  try {
    const { url, projectId, tosConfig } = await request.json();

    if (!url || !projectId) {
      return NextResponse.json({ error: "url and projectId are required" }, { status: 400 });
    }

    // 检查 TOS 配置
    const hasUserConfig = isUserTosConfigured(tosConfig);
    const hasEnvConfig = isTosConfigured();

    if (!hasUserConfig && !hasEnvConfig) {
      return NextResponse.json({ error: "TOS not configured" }, { status: 500 });
    }

    // 下载图片
    console.log("[TransferURL] Downloading:", url.substring(0, 100) + "...");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000), // 30s 超时
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to download image: ${response.status} ${response.statusText}` },
        { status: 400 }
      );
    }

    const contentType = response.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await response.arrayBuffer());

    if (buffer.length === 0) {
      return NextResponse.json({ error: "Downloaded file is empty" }, { status: 400 });
    }

    // 从 URL 或 Content-Type 推断文件扩展名
    const ext = contentType.includes("png") ? "png"
      : contentType.includes("webp") ? "webp"
      : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
      : "png";

    const fileName = `avatar_${Date.now()}.${ext}`;

    // 上传到 TOS 的 global-avatars/thumbnails 路径
    const result = await uploadAsset(
      buffer,
      fileName,
      contentType,
      projectId,
      "image",
      tosConfig || undefined
    );

    console.log("[TransferURL] Uploaded:", result.url.substring(0, 80) + "...");

    return NextResponse.json({
      url: result.url,
      storageKey: result.key,
    });
  } catch (error) {
    console.error("[TransferURL] Error:", error);
    const message = error instanceof Error ? error.message : "Transfer failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
