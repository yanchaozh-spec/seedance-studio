import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

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
      .order("created_at", { ascending: false });

    if (error) throw new Error(`获取素材失败: ${error.message}`);
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
    const { data, error } = await client
      .from("assets")
      .insert({
        project_id: resolvedParams.id,
        name: body.name,
        display_name: body.display_name,
        type: body.type,
        url: body.url,
        thumbnail_url: body.thumbnail_url,
        size: body.size,
        duration: body.duration,
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
