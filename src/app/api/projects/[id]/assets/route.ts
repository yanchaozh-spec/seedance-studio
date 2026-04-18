import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getFileUrl, isTosConfigured } from "@/storage/tos/client";

// GET /api/projects/[id]/assets - 获取项目的所有素材
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("assets")
      .select("*")
      .eq("project_id", resolvedParams.id)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) throw new Error(`获取素材失败: ${error.message}`);
    
    // 如果 TOS 已配置，为有 storage_key 的素材生成签名 URL
    if (isTosConfigured() && data && data.length > 0) {
      const assetsWithUrls = await Promise.all(
        data.map(async (asset: Record<string, unknown>) => {
          // 如果有 storage_key，动态生成签名 URL
          if (asset.storage_key) {
            try {
              const signedUrl = await getFileUrl(asset.storage_key as string);
              return {
                ...asset,
                url: signedUrl,
                thumbnail_url: asset.type === "image" ? signedUrl : asset.thumbnail_url,
              };
            } catch (err) {
              console.error("Failed to generate signed URL for asset:", asset.id, err);
              return asset;
            }
          }
          return asset;
        })
      );
      return NextResponse.json(assetsWithUrls);
    }
    
    return NextResponse.json(data || []);
  } catch (error) {
    console.error("GET /api/projects/[id]/assets error:", error);
    return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
  }
}

// POST /api/projects/[id]/assets - 创建素材记录
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    
    const client = getSupabaseClient();
    
    // 获取当前项目最大的 sort_order，新素材排在最后
    const { data: maxOrderResult } = await client
      .from("assets")
      .select("sort_order")
      .eq("project_id", resolvedParams.id)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextSortOrder = (maxOrderResult?.[0]?.sort_order ?? -1) + 1;
    
    const { data, error } = await client
      .from("assets")
      .insert({
        project_id: resolvedParams.id,
        name: body.name,
        display_name: body.display_name,
        type: body.type,
        is_keyframe: body.is_keyframe || false,
        keyframe_description: body.keyframe_description,
        keyframe_source_task_id: body.keyframe_source_task_id,
        url: body.url,
        thumbnail_url: body.thumbnail_url,
        size: body.size,
        duration: body.duration,
        storage_key: body.storage_key,
        sort_order: nextSortOrder,
      })
      .select()
      .single();

    if (error) throw new Error(`创建素材失败: ${error.message}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error("POST /api/projects/[id]/assets error:", error);
    return NextResponse.json({ error: "Failed to create asset" }, { status: 500 });
  }
}
