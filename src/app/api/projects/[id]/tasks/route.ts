import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/projects/[id]/tasks - 获取项目的所有任务
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("tasks")
      .select("*")
      .eq("project_id", resolvedParams.id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(`获取任务列表失败: ${error.message}`);
    return NextResponse.json(data || []);
  } catch (error) {
    console.error("GET /api/projects/[id]/tasks error:", error);
    return NextResponse.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
}
