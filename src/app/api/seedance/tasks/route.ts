import { NextRequest, NextResponse } from "next/server";
import { getDb, toJsonField } from "@/storage/database/sqlite-client";
import { buildSeedanceRequestBody, buildSeedanceContent, type SeedanceContentItem } from "@/lib/seedance";

const ARK_API_URL = "https://ark.cn-beijing.volces.com/api/v3";
const DEFAULT_MODEL_ID = process.env.ARK_MODEL_ID || "";

// 请求体类型
interface CreateTaskRequest {
  project_id: string;
  prompt_boxes: Array<{
    id: string;
    content: string;
    is_activated: boolean;
    activated_asset_id?: string;
    keyframe_description?: string;
    order: number;
  }>;
  selected_assets: string[];
  params: {
    duration: number;
    ratio: string;
    resolution: string;
    return_last_frame?: boolean;
    tools?: Array<{ type: "web_search" }>;
  };
  model_id?: string;
}



// 创建视频生成任务
export async function POST(request: NextRequest) {
  try {
    const body: CreateTaskRequest = await request.json();
    const { project_id, prompt_boxes, selected_assets, params } = body;

    const apiKey = request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;

    if (!apiKey) {
      console.error("[CREATE TASK] ARK API Key not configured");
      return NextResponse.json({ error: "ARK API Key not configured" }, { status: 500 });
    }

    const db = getDb();

    // 获取选中的素材
    const placeholders = selected_assets.map(() => "?").join(",");
    const assets = db.prepare(`SELECT * FROM assets WHERE id IN (${placeholders})`).all(...selected_assets) as Record<string, unknown>[];

    // 如果有图片绑定了音频，也需要获取这些音频素材
    const allAssetRows = [...assets];
    const boundAudioIds = assets
      .filter((a) => (a.type === "image" || a.type === "keyframe" || a.type === "virtual_avatar" || a.asset_category === "keyframe" || a.is_keyframe) && a.bound_audio_id)
      .map((a) => a.bound_audio_id as string)
      .filter((id): id is string => !!id);

    if (boundAudioIds.length > 0) {
      const audioPlaceholders = boundAudioIds.map(() => "?").join(",");
      const boundAudios = db.prepare(`SELECT * FROM assets WHERE id IN (${audioPlaceholders})`).all(...boundAudioIds) as Record<string, unknown>[];

      if (boundAudios && boundAudios.length > 0) {
        const existingIds = new Set(allAssetRows.map((a) => a.id));
        for (const b of boundAudios) {
          if (!existingIds.has(b.id)) {
            allAssetRows.push(b);
          }
        }
      }
    }

    // 构建 content 数组（使用共享逻辑）
    const content = buildSeedanceContent(
      allAssetRows as Array<{
        id: string;
        url: string;
        type: string;
        display_name?: string;
        name: string;
        asset_category?: string;
        asset_id?: string;
        bound_audio_id?: string;
        keyframe_description?: string;
        is_keyframe?: boolean;
      }>,
      prompt_boxes.map((box, idx) => ({
        content: box.content,
        order: idx,
        keyframeDescription: box.keyframe_description,
      })),
      false // 后端已预筛选素材，不需要过滤激活状态
    );

    if (content.length === 0) {
      return NextResponse.json({ error: "No content to generate" }, { status: 400 });
    }

    const modelId = body.model_id || DEFAULT_MODEL_ID;

    const requestBody = buildSeedanceRequestBody(modelId, content as unknown as SeedanceContentItem[], {
      ratio: params.ratio,
      duration: params.duration,
      resolution: params.resolution,
      return_last_frame: params.return_last_frame,
      tools: params.tools,
    });

    try {
      const response = await fetch(`${ARK_API_URL}/contents/generations/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-Client-Request-Id": "Coze,Integrations",
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        let errorMessage = "API request failed";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorData.error?.code || errorMessage;
        } catch {
          // 响应体不是 JSON
        }
        console.error("[CREATE TASK] API error:", response.status, errorMessage);

        // 写入一条 failed 任务记录，方便任务管理页面查看失败原因
        const failedTaskId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        db.prepare(`
          INSERT INTO tasks (id, project_id, status, model_mode, model_id, progress, prompt_boxes, selected_assets, params, error_message, queued_at, completed_at, api_key)
          VALUES (?, ?, 'failed', 'standard', ?, 0, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
        `).run(
          failedTaskId,
          project_id,
          modelId,
          toJsonField(prompt_boxes),
          toJsonField(selected_assets),
          toJsonField(params),
          errorMessage,
          apiKey
        );

        return NextResponse.json({
          id: failedTaskId,
          status: "failed",
          error: errorMessage,
        }, { status: response.status });
      }

      const data = await response.json();

      if (data.error) {
        console.error("[CREATE TASK] Business error:", data.error);
        const msg = data.error?.message || data.error?.code || "Task creation failed";

        // 写入一条 failed 任务记录
        const failedTaskId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        db.prepare(`
          INSERT INTO tasks (id, project_id, status, model_mode, model_id, progress, prompt_boxes, selected_assets, params, error_message, queued_at, completed_at, api_key)
          VALUES (?, ?, 'failed', 'standard', ?, 0, ?, ?, ?, ?, datetime('now', 'localtime'), datetime('now', 'localtime'), ?)
        `).run(
          failedTaskId,
          project_id,
          modelId,
          toJsonField(prompt_boxes),
          toJsonField(selected_assets),
          toJsonField(params),
          msg,
          apiKey
        );

        return NextResponse.json({
          id: failedTaskId,
          status: "failed",
          error: msg,
        }, { status: 400 });
      }

      // 使用 API 返回的 task ID 保存任务到数据库
      const taskId = data.id;
      db.prepare(`
        INSERT INTO tasks (id, project_id, task_id_external, status, model_mode, model_id, progress, prompt_boxes, selected_assets, params, queued_at, api_key)
        VALUES (?, ?, ?, 'queued', 'standard', ?, 0, ?, ?, ?, datetime('now', 'localtime'), ?)
      `).run(
        taskId,
        project_id,
        taskId,
        modelId,
        toJsonField(prompt_boxes),
        toJsonField(selected_assets),
        toJsonField(params),
        apiKey
      );

      return NextResponse.json({
        id: taskId,
        status: "queued",
        model: modelId,
      });
    } catch (apiError) {
      console.error("API call failed:", apiError);
      throw apiError;
    }
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

    const apiKey = request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
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
      return NextResponse.json({
        error: data.error?.message || data.error?.code || "API request failed"
      }, { status: response.status });
    }

    // 更新数据库中的任务状态
    const db = getDb();

    const updateData: Record<string, unknown> = {
      status: data.status,
      progress: data.status === "running" ? 50 : data.status === "succeeded" ? 100 : 0,
    };

    if (data.status === "running" || data.status === "succeeded") {
      updateData.started_at = new Date(data.updated_at * 1000).toISOString();
    }

    if (data.status === "succeeded") {
      updateData.completed_at = new Date(data.updated_at * 1000).toISOString();
      updateData.result = JSON.stringify({
        video_url: data.content?.video_url,
        resolution: data.resolution,
        duration: data.duration,
        last_frame_url: data.content?.last_frame_url,
      });
    }

    if (data.status === "failed") {
      updateData.completed_at = new Date(data.updated_at * 1000).toISOString();
      updateData.error_message = data.error?.message || "Generation failed";
    }

    if (data.usage) {
      updateData.completion_tokens = data.usage.completion_tokens;
      updateData.total_tokens = data.usage.total_tokens;
    }

    // 计算耗时
    const task = db.prepare("SELECT * FROM tasks WHERE id = ?").get(taskId) as Record<string, unknown> | undefined;
    if (task) {
      const queuedAt = task.queued_at ? new Date(task.queued_at as string).getTime() : 0;
      const startedAt = updateData.started_at ? new Date(updateData.started_at as string).getTime() : 0;
      const completedAt = updateData.completed_at ? new Date(updateData.completed_at as string).getTime() : Date.now();

      if (queuedAt && startedAt) {
        updateData.queue_duration = Math.round((startedAt - queuedAt) / 1000);
      }
      if (startedAt) {
        updateData.generation_duration = Math.round((completedAt - startedAt) / 1000);
      }
    }

    // 动态构建 UPDATE
    const setClauses: string[] = [];
    const values: unknown[] = [];
    for (const [key, value] of Object.entries(updateData)) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
    setClauses.push("updated_at = datetime('now', 'localtime')");
    values.push(taskId);

    db.prepare(`UPDATE tasks SET ${setClauses.join(", ")} WHERE id = ?`).run(...values);

    const parsedResult = typeof updateData.result === "string" ? JSON.parse(updateData.result) : updateData.result;

    return NextResponse.json({
      id: data.id,
      status: data.status,
      progress: updateData.progress,
      result: parsedResult,
      error_message: updateData.error_message,
      completion_tokens: updateData.completion_tokens,
      total_tokens: updateData.total_tokens,
      queue_duration: updateData.queue_duration,
      generation_duration: updateData.generation_duration,
    });
  } catch (error) {
    console.error("Get task error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
