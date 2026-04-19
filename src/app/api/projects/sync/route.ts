import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { putJson, listObjects, getJson, isUserTosConfigured, TosConfig } from "@/storage/tos/client";
import { generateSlug } from "@/lib/slug";

interface ProjectManifest {
  version: 1;
  exportedAt: string;
  project: {
    name: string;
    slug: string;
    description: string;
  };
  assets: {
    id: string;
    name: string;
    display_name: string | null;
    type: string;
    asset_category: string;
    asset_id: string | null;
    is_keyframe: number;
    keyframe_description: string | null;
    keyframe_source_task_id: string | null;
    url: string;
    thumbnail_url: string | null;
    size: number | null;
    duration: number | null;
    storage_key: string | null;
    bound_audio_id: string | null;
    sort_order: number;
  }[];
  tasks: {
    id: string;
    task_id_external: string | null;
    status: string;
    model_mode: string | null;
    model_id: string | null;
    progress: number;
    prompt_boxes: string;
    selected_assets: string;
    params: string | null;
    result: string | null;
    error_message: string | null;
    permanent_video_url: string | null;
    video_storage_key: string | null;
    queued_at: string | null;
    started_at: string | null;
    completed_at: string | null;
    queue_duration: number | null;
    generation_duration: number | null;
  }[];
}

// POST /api/projects/sync - 推送项目到云端
export async function POST(request: NextRequest) {
  try {
    const { projectId, tosConfig } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const config = tosConfig as TosConfig | undefined;
    if (!config || !isUserTosConfigured(config)) {
      return NextResponse.json({ error: "TOS 未配置或配置无效" }, { status: 400 });
    }

    const db = getDb();

    // 获取项目信息
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as Record<string, unknown> | undefined;
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 获取项目素材
    const assets = db.prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY sort_order").all(projectId) as Record<string, unknown>[];

    // 获取项目任务
    const tasks = db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Record<string, unknown>[];

    // 构建清单
    const manifest: ProjectManifest = {
      version: 1,
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name as string,
        slug: project.slug as string,
        description: (project.description as string) || "",
      },
      assets: assets.map((a) => ({
        id: a.id as string,
        name: a.name as string,
        display_name: (a.display_name as string) || null,
        type: a.type as string,
        asset_category: (a.asset_category as string) || "image",
        asset_id: (a.asset_id as string) || null,
        is_keyframe: (a.is_keyframe as number) || 0,
        keyframe_description: (a.keyframe_description as string) || null,
        keyframe_source_task_id: (a.keyframe_source_task_id as string) || null,
        url: a.url as string,
        thumbnail_url: (a.thumbnail_url as string) || null,
        size: (a.size as number) || null,
        duration: (a.duration as number) || null,
        storage_key: (a.storage_key as string) || null,
        bound_audio_id: (a.bound_audio_id as string) || null,
        sort_order: (a.sort_order as number) || 0,
      })),
      tasks: tasks.map((t) => ({
        id: t.id as string,
        task_id_external: (t.task_id_external as string) || null,
        status: t.status as string,
        model_mode: (t.model_mode as string) || null,
        model_id: (t.model_id as string) || null,
        progress: (t.progress as number) || 0,
        prompt_boxes: (t.prompt_boxes as string) || "[]",
        selected_assets: (t.selected_assets as string) || "[]",
        params: (t.params as string) || null,
        result: (t.result as string) || null,
        error_message: (t.error_message as string) || null,
        permanent_video_url: (t.permanent_video_url as string) || null,
        video_storage_key: (t.video_storage_key as string) || null,
        queued_at: (t.queued_at as string) || null,
        started_at: (t.started_at as string) || null,
        completed_at: (t.completed_at as string) || null,
        queue_duration: (t.queue_duration as number) || null,
        generation_duration: (t.generation_duration as number) || null,
      })),
    };

    // 上传到 TOS
    const slug = project.slug as string;
    const key = `projects/${slug}/project.json`;
    await putJson(key, manifest, config);

    return NextResponse.json({
      success: true,
      key,
      assetCount: assets.length,
      taskCount: tasks.length,
    });
  } catch (error) {
    console.error("POST /api/projects/sync error:", error);
    return NextResponse.json({ error: "推送失败: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

// GET /api/projects/sync - 列出云端可拉取的项目
export async function GET(request: NextRequest) {
  try {
    const tosConfigStr = request.nextUrl.searchParams.get("tosConfig");
    if (!tosConfigStr) {
      return NextResponse.json({ error: "tosConfig is required" }, { status: 400 });
    }

    const config = JSON.parse(tosConfigStr) as TosConfig;
    if (!isUserTosConfigured(config)) {
      return NextResponse.json({ error: "TOS 配置无效" }, { status: 400 });
    }

    // 列出所有 projects/*/project.json
    const objects = await listObjects("projects/", config);
    const manifestKeys = objects.filter((obj) => obj.key.endsWith("/project.json"));

    // 读取每个 manifest 的基本信息
    const cloudProjects: {
      slug: string;
      name: string;
      exportedAt: string;
      assetCount: number;
      taskCount: number;
      key: string;
    }[] = [];

    for (const obj of manifestKeys) {
      try {
        const manifest = await getJson<ProjectManifest>(obj.key, config);
        cloudProjects.push({
          slug: manifest.project.slug,
          name: manifest.project.name,
          exportedAt: manifest.exportedAt,
          assetCount: manifest.assets.length,
          taskCount: manifest.tasks.length,
          key: obj.key,
        });
      } catch (err) {
        console.error("Failed to read manifest:", obj.key, err);
      }
    }

    // 获取本地已有的 slug 列表
    const db = getDb();
    const localSlugs = new Set(
      (db.prepare("SELECT slug FROM projects").all() as { slug: string }[]).map((r) => r.slug).filter(Boolean)
    );

    return NextResponse.json({
      projects: cloudProjects.map((p) => ({
        ...p,
        isLocal: localSlugs.has(p.slug),
      })),
    });
  } catch (error) {
    console.error("GET /api/projects/sync error:", error);
    return NextResponse.json({ error: "获取云端项目失败" }, { status: 500 });
  }
}

// PUT /api/projects/sync - 从云端拉取项目
export async function PUT(request: NextRequest) {
  try {
    const { key, tosConfig } = await request.json();

    if (!key) {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const config = tosConfig as TosConfig | undefined;
    if (!config || !isUserTosConfigured(config)) {
      return NextResponse.json({ error: "TOS 未配置或配置无效" }, { status: 400 });
    }

    // 读取云端清单
    const manifest = await getJson<ProjectManifest>(key, config);

    const db = getDb();

    // 检查是否本地已存在同名 slug
    const existing = db.prepare("SELECT id FROM projects WHERE slug = ?").get(manifest.project.slug) as { id: string } | undefined;
    if (existing) {
      return NextResponse.json({ error: "本地已存在同名项目，请先删除或重命名本地项目" }, { status: 409 });
    }

    // 创建本地项目
    const insertResult = db.prepare("INSERT INTO projects (name, slug, description) VALUES (?, ?, ?) RETURNING *").get(
      manifest.project.name,
      manifest.project.slug,
      manifest.project.description
    ) as Record<string, unknown>;

    const projectId = insertResult.id as string;

    // 导入素材
    let importedAssets = 0;
    const assetIdMapping = new Map<string, string>(); // 旧ID -> 新ID
    for (const asset of manifest.assets) {
      const newId = (db.prepare("INSERT INTO assets (project_id, name, display_name, type, asset_category, asset_id, is_keyframe, keyframe_description, keyframe_source_task_id, url, thumbnail_url, size, duration, storage_key, bound_audio_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id").get(
        projectId,
        asset.name,
        asset.display_name,
        asset.type,
        asset.asset_category,
        asset.asset_id,
        asset.is_keyframe,
        asset.keyframe_description,
        asset.keyframe_source_task_id,
        asset.url,
        asset.thumbnail_url,
        asset.size,
        asset.duration,
        asset.storage_key,
        asset.bound_audio_id,
        asset.sort_order
      ) as Record<string, unknown>).id as string;
      assetIdMapping.set(asset.id, newId);
      importedAssets++;
    }

    // 更新 bound_audio_id 引用
    for (const [oldId, newId] of assetIdMapping.entries()) {
      // 查找所有引用了旧 ID 的素材
      const boundAssets = db.prepare("SELECT id FROM assets WHERE project_id = ? AND bound_audio_id = ?").all(projectId, oldId) as { id: string }[];
      for (const ba of boundAssets) {
        db.prepare("UPDATE assets SET bound_audio_id = ? WHERE id = ?").run(newId, ba.id);
      }
    }

    // 导入任务
    let importedTasks = 0;
    for (const task of manifest.tasks) {
      // 更新 selected_assets 中的旧 asset ID 为新 ID
      let selectedAssets = task.selected_assets;
      try {
        const parsed = JSON.parse(selectedAssets) as string[];
        const updated = parsed.map((id: string) => assetIdMapping.get(id) || id);
        selectedAssets = JSON.stringify(updated);
      } catch {
        // 保持原样
      }

      db.prepare("INSERT INTO tasks (id, project_id, task_id_external, status, model_mode, model_id, progress, prompt_boxes, selected_assets, params, result, error_message, permanent_video_url, video_storage_key, queued_at, started_at, completed_at, queue_duration, generation_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
        task.id,
        projectId,
        task.task_id_external,
        task.status,
        task.model_mode,
        task.model_id,
        task.progress,
        task.prompt_boxes,
        selectedAssets,
        task.params,
        task.result,
        task.error_message,
        task.permanent_video_url,
        task.video_storage_key,
        task.queued_at,
        task.started_at,
        task.completed_at,
        task.queue_duration,
        task.generation_duration
      );
      importedTasks++;
    }

    return NextResponse.json({
      success: true,
      project: insertResult,
      importedAssets,
      importedTasks,
    });
  } catch (error) {
    console.error("PUT /api/projects/sync error:", error);
    return NextResponse.json({ error: "拉取失败: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}
