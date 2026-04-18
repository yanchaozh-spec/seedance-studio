import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// PATCH /api/assets/reorder - 批量更新素材排序
// 请求体: { items: [{ id: string, sort_order: number }, ...] }
export async function PATCH(request: NextRequest) {
  try {
    const { items } = await request.json();

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "items must be a non-empty array" },
        { status: 400 }
      );
    }

    // 校验每项结构
    for (const item of items) {
      if (!item.id || typeof item.sort_order !== "number") {
        return NextResponse.json(
          { error: "Each item must have id (string) and sort_order (number)" },
          { status: 400 }
        );
      }
    }

    const client = getSupabaseClient();

    // 逐条更新 sort_order（批量更新在 Supabase REST API 中没有原生支持）
    // 使用 Promise.all 并行执行
    const results = await Promise.all(
      items.map((item: { id: string; sort_order: number }) =>
        client
          .from("assets")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id)
      )
    );

    // 检查是否有失败
    const failed = results.find((r) => r.error);
    if (failed && failed.error) {
      console.error("Reorder update failed:", failed.error);
      return NextResponse.json(
        { error: "Failed to update sort order" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/assets/reorder error:", error);
    return NextResponse.json(
      { error: "Failed to reorder assets" },
      { status: 500 }
    );
  }
}
