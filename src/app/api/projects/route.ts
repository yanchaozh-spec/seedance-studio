import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";

// GET /api/projects - 获取所有项目
export async function GET() {
  try {
    const db = getDb();
    const data = db.prepare("SELECT * FROM projects ORDER BY created_at DESC").all();
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/projects error:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}

// POST /api/projects - 创建项目
export async function POST(request: NextRequest) {
  try {
    const { name, description } = await request.json();

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const db = getDb();
    const data = db.prepare("INSERT INTO projects (name, description) VALUES (?, ?) RETURNING *").get(name.trim(), description || "") as Record<string, unknown>;
    return NextResponse.json(data);
  } catch (error) {
    console.error("POST /api/projects error:", error);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}
