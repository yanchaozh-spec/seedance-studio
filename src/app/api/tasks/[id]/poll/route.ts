import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient } from "@/storage/database/supabase-client";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const client = getSupabaseClient();
    
    const { data: task, error } = await client
      .from("tasks")
      .select("*")
      .eq("id", resolvedParams.id)
      .maybeSingle();

    if (error) throw new Error("Failed to fetch task");
    if (!task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    // 如果已完成或失败，直接返回
    if (task.status === "succeeded" || task.status === "failed") {
      return NextResponse.json({
        id: task.id,
        status: task.status,
        progress: task.progress || 100,
        result: task.result,
        error_message: task.error_message,
      });
    }

    // 如果有外部任务ID，需要调用外部API更新状态
    if (task.task_id_external && task.status !== "pending") {
      const apiKey = task.api_key || request.headers.get("x-ark-api-key") || process.env.ARK_API_KEY;
      
      if (!apiKey) {
        return NextResponse.json({
          id: task.id,
          status: task.status,
          progress: task.progress || 0,
          warning: "ARK_API_KEY not configured",
        });
      }
      
      try {
        const response = await fetch(
          `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${task.task_id_external}`,
          {
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "X-Client-Request-Id": "Coze,Integrations",
            },
          }
        );

        if (!response.ok) {
          return NextResponse.json({
            id: task.id,
            status: task.status,
            progress: task.progress || 0,
          });
        }

        const externalTask = await response.json();
        
        if (externalTask.error) {
          console.log("[POLL] External API returned error, updating DB and returning failed");
          // 更新数据库中的任务状态
          await client.from("tasks").update({
            status: "failed",
            error_message: externalTask.error?.message || "Task failed",
            updated_at: new Date().toISOString(),
            completed_at: new Date().toISOString(),
          }).eq("id", task.id);
          
          return NextResponse.json({
            id: task.id,
            status: "failed",
            error_message: externalTask.error?.message || "Task failed",
          });
        }
        
        console.log("[POLL] Full external task response:", JSON.stringify(externalTask));
        
        const updates: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        console.log("[POLL] External task status:", externalTask.status, "Task ID:", task.id, "DB Status:", task.status);
        
        // 解析状态
        if (externalTask.status === "succeeded") {
          updates.status = "succeeded";
          updates.progress = 100;
          updates.completed_at = new Date().toISOString();
          
          let videoUrl = "";
          let lastFrameUrl = "";
          
          if (externalTask.content && typeof externalTask.content === "object") {
            if (!Array.isArray(externalTask.content)) {
              // 对象格式 - 官方文档格式
              const content = externalTask.content as { video_url?: string; last_frame_url?: string };
              videoUrl = content.video_url || "";
              lastFrameUrl = content.last_frame_url || "";
            } else {
              // 数组格式 - 兼容旧版 API
              const items = externalTask.content as Array<{ type: string; role?: string; video_url?: { url: string }; image_url?: { url: string } }>;
              const videoItem = items.find((c) => c.type === "video_url");
              const lastFrameItem = items.find((c) => c.type === "image_url" && c.role === "last_frame");
              videoUrl = videoItem?.video_url?.url || "";
              lastFrameUrl = lastFrameItem?.image_url?.url || "";
            }
          }
            
          updates.result = {
            video_url: videoUrl,
            resolution: task.params?.resolution,
            duration: task.params?.duration,
            last_frame_url: lastFrameUrl,
          };
          
          // 计算排队耗时（从排队到开始生成）
          if (task.queued_at && updates.started_at) {
            updates.queue_duration = Math.round(
              (new Date(updates.started_at as string).getTime() - new Date(task.queued_at).getTime()) / 1000
            );
          }
          
          // 计算生成耗时（从开始生成到完成）
          if (task.started_at && updates.completed_at) {
            updates.generation_duration = Math.round(
              (new Date(updates.completed_at as string).getTime() - new Date(task.started_at).getTime()) / 1000
            );
          } else if (!task.generation_duration && updates.completed_at && task.queued_at) {
            // 如果没有 started_at 但有 completed_at 和 queued_at，总时间作为生成耗时
            const completedTime = new Date(updates.completed_at as string).getTime();
            const queuedTime = new Date(task.queued_at).getTime();
            updates.generation_duration = Math.max(0, Math.round((completedTime - queuedTime) / 1000));
            // 如果没有 started_at，排队耗时设为 null（无法确定）
            updates.queue_duration = null;
          }
        } else if (externalTask.status === "failed") {
          updates.status = "failed";
          updates.error_message = externalTask.error?.message || "Generation failed";
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
        } else if (externalTask.status === "pending") {
          updates.status = "pending";
          updates.progress = 0;
        }

        if (externalTask.data?.usage) {
          updates.completion_tokens = externalTask.data.usage.completion_tokens;
          updates.total_tokens = externalTask.data.usage.total_tokens;
        }

        console.log("[POLL] Updating DB with:", JSON.stringify(updates));
        const { data: updateResult, error: updateError } = await client.from("tasks").update(updates).eq("id", task.id);
        console.log("[POLL] DB update result:", updateResult, "error:", updateError);
        console.log("[POLL] DB update completed");

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
      } catch (apiError) {
        console.error("External API call failed:", apiError);
        return NextResponse.json({
          id: task.id,
          status: task.status,
          progress: task.progress || 0,
          warning: "Failed to poll external API",
        });
      }
    }

    return NextResponse.json({
      id: task.id,
      status: task.status,
      progress: task.progress || 0,
      result: task.result,
      error_message: task.error_message,
    });
  } catch (error) {
    console.error("Poll error:", error);
    return NextResponse.json({ error: "Failed to poll task" }, { status: 500 });
  }
}
