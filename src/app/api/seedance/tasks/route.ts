import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";
import { getAsset } from "@/lib/assets";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";
const MODEL_ID = "doubao-seedance-2-0-260128";

interface CreateTaskRequest {
  project_id: string;
  prompt_boxes: Array<{
    id: string;
    content: string;
    is_activated: boolean;
    activated_asset_id?: string;
    order: number;
  }>;
  selected_assets: string[];
  params: {
    duration: number;
    ratio: string;
    resolution: string;
  };
}

// 创建视频生成任务
export async function POST(request: NextRequest) {
  try {
    const body: CreateTaskRequest = await request.json();
    const { project_id, prompt_boxes, selected_assets, params } = body;

    // 获取 ARK API Key
    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    // 获取选中的素材
    const client = getSupabaseClient();
    const { data: assets, error: assetsError } = await client
      .from("assets")
      .select("*")
      .in("id", selected_assets);

    if (assetsError) {
      return NextResponse.json({ error: "Failed to fetch assets" }, { status: 500 });
    }

    // 构建 content 数组
    const content: Array<{
      type: "text" | "image_url";
      text?: string;
      image_url?: { url: string };
    }> = [];

    // 按顺序添加提示词和素材
    const imageAssets = (assets || []).filter((a: { type: string }) => a.type === "image");
    
    prompt_boxes
      .sort((a, b) => a.order - b.order)
      .forEach((box) => {
        if (!box.content.trim()) return;

        let text = box.content.trim();

        // 如果激活了素材引用
        if (box.is_activated && imageAssets.length > 0) {
          const imageAsset = imageAssets[0];
          const displayName = imageAsset.display_name || "图1";
          
          let referenceText = `"${displayName}"@这张图片`;
          
          // 如果绑定了音频，添加声线描述
          if (imageAsset.bound_audio_id) {
            const audioAsset = (assets || []).find(
              (a: { id: string }) => a.id === imageAsset.bound_audio_id
            );
            if (audioAsset?.voice_description) {
              referenceText += `，声线为"${audioAsset.voice_description}"`;
            }
          }
          
          text = `${referenceText}，${text}`;
        }

        content.push({
          type: "text",
          text,
        });

        // 如果有图片素材，作为首帧添加到最后一个文本内容后面
        if (box.is_activated && imageAssets.length > 0) {
          const imageAsset = imageAssets[0];
          content.push({
            type: "image_url",
            image_url: {
              url: imageAsset.url,
            },
          });
        }
      });

    if (content.length === 0) {
      return NextResponse.json({ error: "No content to generate" }, { status: 400 });
    }

    // 调用 ARK API 创建任务
    const response = await fetch(`${ARK_API_URL}/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL_ID,
        content,
        generate_audio: true,
        ratio: params.ratio,
        duration: params.duration,
        watermark: false,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      // 保存失败任务到数据库
      await client.from("tasks").insert({
        project_id,
        id: `failed-${Date.now()}`,
        status: "failed",
        progress: 0,
        prompt_boxes,
        selected_assets,
        params,
        error_message: data.error?.message || JSON.stringify(data),
      });

      return NextResponse.json({ error: data.error || "API request failed" }, { status: response.status });
    }

    // 保存任务到数据库
    const taskId = data.id;
    const { error: insertError } = await client.from("tasks").insert({
      project_id,
      id: taskId,
      status: "queued",
      progress: 0,
      prompt_boxes,
      selected_assets,
      params,
    });

    if (insertError) {
      console.error("Failed to save task:", insertError);
    }

    return NextResponse.json({
      id: taskId,
      status: "queued",
    });
  } catch (error) {
    console.error("Create task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// 获取任务状态
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("id");

    if (!taskId) {
      return NextResponse.json({ error: "Task ID required" }, { status: 400 });
    }

    const apiKey = process.env.ARK_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    const response = await fetch(`${ARK_API_URL}/contents/generations/tasks/${taskId}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json({ error: data.error || "API request failed" }, { status: response.status });
    }

    // 更新数据库中的任务状态
    const client = getSupabaseClient();
    const status = data.status === "succeeded" ? "succeeded" : data.status === "failed" ? "failed" : data.status;
    
    const updateData: Record<string, unknown> = {
      status,
      progress: data.status === "running" ? 50 : data.status === "succeeded" ? 100 : 0,
    };

    if (data.status === "succeeded" && data.content) {
      updateData.result = {
        video_url: data.content.video_url,
        resolution: data.resolution,
        duration: data.duration,
      };
    }

    if (data.status === "failed") {
      updateData.error_message = data.error?.message || "Generation failed";
    }

    await client.from("tasks").update(updateData).eq("id", taskId);

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: updateData.progress,
      result: updateData.result,
      error_message: updateData.error_message,
    });
  } catch (error) {
    console.error("Get task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
