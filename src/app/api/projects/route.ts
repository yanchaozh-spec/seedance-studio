import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/projects - 获取所有项目
export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`获取项目列表失败: ${error.message}`);
    return NextResponse.json(data || []);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

// POST /api/projects - 创建项目
export async function POST(request: NextRequest) {
  try {
    const { name } = await request.json();
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from("projects")
      .insert({ name: name.trim() })
      .select()
      .single();

    if (error) throw new Error(`创建项目失败: ${error.message}`);
    return NextResponse.json(data);
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
