import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/debug/rollback?taskId=xxx - 诊断回滚数据
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json({ error: "taskId is required" }, { status: 400 });
  }

  const client = getSupabaseClient();
  const { data, error } = await client
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 检查数据结构
  const diagnosis = {
    taskId: data.id,
    hasPromptBoxes: !!data.prompt_boxes,
    promptBoxesLength: data.prompt_boxes ? (Array.isArray(data.prompt_boxes) ? data.prompt_boxes.length : "not_array") : 0,
    promptBoxesContent: data.prompt_boxes,
    hasSelectedAssets: !!data.selected_assets,
    selectedAssetsLength: data.selected_assets ? (Array.isArray(data.selected_assets) ? data.selected_assets.length : "not_array") : 0,
    selectedAssetsContent: data.selected_assets,
    hasParams: !!data.params,
    paramsContent: data.params,
    // 模拟 sessionStorage 保存后的数据结构
    simulatedRollbackData: {
      id: data.id,
      prompt_boxes: data.prompt_boxes,
      selected_assets: data.selected_assets,
      params: data.params,
    }
  };

  return NextResponse.json(diagnosis);
}
