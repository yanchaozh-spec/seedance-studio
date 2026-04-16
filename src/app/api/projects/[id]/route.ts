import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/projects/[id] - 获取单个项目
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("projects")
      .select("*")
      .eq("id", resolvedParams.id)
      .maybeSingle();

    if (error) throw new Error(`获取项目失败: ${error.message}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to fetch project" }, { status: 500 });
  }
}

// PATCH /api/projects/[id] - 更新项目
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const body = await request.json();
    const client = getSupabaseClient();
    
    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    
    const { data, error } = await client
      .from("projects")
      .update(updateData)
      .eq("id", resolvedParams.id)
      .select()
      .maybeSingle();

    if (error) throw new Error(`更新项目失败: ${error.message}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error("PATCH /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to update project" }, { status: 500 });
  }
}

// DELETE /api/projects/[id] - 删除项目
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    const { error } = await client.from("projects").delete().eq("id", resolvedParams.id);

    if (error) throw new Error(`删除项目失败: ${error.message}`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projects/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete project" }, { status: 500 });
  }
}
