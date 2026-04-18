import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";

// DELETE /api/global-avatars/[id] - 删除全局虚拟人像
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = getDb();
    db.prepare("DELETE FROM global_avatars WHERE id = ?").run(resolvedParams.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/global-avatars/[id] error:", error);
    return NextResponse.json({ error: "Failed to delete global avatar" }, { status: 500 });
  }
}
