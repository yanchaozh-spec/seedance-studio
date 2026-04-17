import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

// GET /api/tasks/[id]/poll - 轮询任务状态（供前端定期调用）
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    
    // 获取任务信息
    const { data: task, error } = await client
      .from("tasks")
      .select("*")
      .eq("id", resolvedParams.id)
      .maybeSingle();

    if (error) throw new Error(`获取任务失败: ${error.message}`);
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // 如果任务已完成或失败，直接返回
    if (task.status === "succeeded" || task.status === "failed") {
      return NextResponse.json({
        id: task.id,
        status: task.status,
        progress: task.progress || 100,
        result: task.result,
        error_message: task.error_message,
        completion_tokens: task.completion_tokens,
        total_tokens: task.total_tokens,
        queue_duration: task.queue_duration,
        generation_duration: task.generation_duration,
        completed_at: task.completed_at,
        updated_at: task.updated_at,
      });
    }

    // 如果有外部任务ID，需要调用外部API更新状态
    if (task.task_id_external && task.status !== "pending") {
      // 优先级：数据库保存的 API Key > 请求头 > 环境变量
      const apiKey = task.api_key || request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
      
      if (!apiKey) {
        console.warn("[POLL] ARK_API_KEY not configured, cannot poll external API");
        // 返回当前状态，带警告信息
        return NextResponse.json({
          id: task.id,
          status: task.status,
          progress: task.progress || 0,
          result: task.result,
          error_message: task.error_message,
          warning: "ARK_API_KEY not configured. Task status cannot be updated.",
        });
      }
      
      try {
        const response = await fetch(
          `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${task.task_id_external}`,
          {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          const externalTask = await response.json();
          
          // 更新本地任务状态
          const updates: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };

          // 解析外部状态
          if (externalTask.status === "succeeded") {
            updates.status = "succeeded";
            updates.progress = 100;
            updates.completed_at = new Date().toISOString();
            
            // content 可能是对象 { video_url: "..." } 或数组 [{ type: "video_url", video_url: {...} }]
            let videoUrl = "";
            let lastFrameUrl = "";
            
            if (Array.isArray(externalTask.content)) {
              // 数组格式
              const contentItem = externalTask.content as Array<{ type: string; role?: string; video_url?: { url: string }; image_url?: { url: string } }>;
              const videoItem = contentItem.find((c) => c.type === "video_url");
              const lastFrameItem = contentItem.find((c) => c.type === "image_url" && c.role === "last_frame");
              videoUrl = videoItem?.video_url?.url || "";
              lastFrameUrl = lastFrameItem?.image_url?.url || "";
            } else if (externalTask.content) {
              // 对象格式 { video_url: "...", last_frame_url: "..." }
              videoUrl = externalTask.content.video_url || "";
              lastFrameUrl = externalTask.content.last_frame_url || "";
            }
            
            updates.result = {
              video_url: videoUrl,
              resolution: task.params?.resolution,
              duration: task.params?.duration,
              last_frame_url: lastFrameUrl,
            };
            // 更新耗时
            if (task.started_at) {
              updates.generation_duration = Math.round(
                (new Date(updates.completed_at as string).getTime() - new Date(task.started_at).getTime()) / 1000
              );
            }
          } else if (externalTask.status === "failed") {
            updates.status = "failed";
            updates.error_message = externalTask.error?.message || "生成失败";
            updates.completed_at = new Date().toISOString();
          } else if (externalTask.status === "running" || externalTask.status === "processing") {
            updates.status = "running";
            updates.progress = 50;
            if (!task.started_at) {
              updates.started_at = new Date().toISOString();
            }
          } else if (externalTask.status === "queued") {
            updates.status = "queued";
            updates.queue_duration = task.queue_duration || 0;
          }

          // 如果有token消耗信息
          if (externalTask.data?.usage) {
            updates.completion_tokens = externalTask.data.usage.completion_tokens;
            updates.total_tokens = externalTask.data.usage.total_tokens;
          }

          // 更新数据库
          const { error: updateError } = await client
            .from("tasks")
            .update(updates)
            .eq("id", task.id);

          if (updateError) {
            console.error("更新任务状态失败:", updateError);
          }

          // 返回最新状态
          return NextResponse.json({
            id: task.id,
            status: updates.status,
            progress: updates.progress,
            result: updates.result,
            error_message: updates.error_message,
            completion_tokens: updates.completion_tokens,
            total_tokens: updates.total_tokens,
            queue_duration: updates.queue_duration,
            generation_duration: updates.generation_duration,
            completed_at: updates.completed_at,
            updated_at: updates.updated_at,
          });
        }
      } catch (apiError) {
        console.error("调用外部API失败:", apiError);
        // API调用失败时继续返回当前状态
      }
    }

    // 返回当前状态
    return NextResponse.json({
      id: task.id,
      status: task.status,
      progress: task.progress || 0,
      result: task.result,
      error_message: task.error_message,
      completion_tokens: task.completion_tokens,
      total_tokens: task.total_tokens,
      queue_duration: task.queue_duration,
      generation_duration: task.generation_duration,
      completed_at: task.completed_at,
      updated_at: task.updated_at,
    });
  } catch (error) {
    console.error("GET /api/tasks/[id]/poll error:", error);
    return NextResponse.json({ error: "Failed to poll task" }, { status: 500 });
  }
}
