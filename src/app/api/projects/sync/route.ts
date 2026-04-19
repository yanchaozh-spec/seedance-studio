import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/storage/database/sqlite-client";
import { putJson, listObjects, getJson, isUserTosConfigured, TosConfig } from "@/storage/tos/client";
import Database from "better-sqlite3";

interface ProjectManifest {
  schemaVersion: 2;
  cloudVersion: number;
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

// POST /api/projects/sync - 推送项目到云端（自动同步用）
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

    // 原子递增云端版本（防止并发推送版本重复）
    const versionRow = db.prepare("UPDATE projects SET cloud_version = cloud_version + 1 WHERE id = ? RETURNING cloud_version").get(projectId) as { cloud_version: number } | undefined;
    if (!versionRow) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    const newVersion = versionRow.cloud_version;

    // 获取项目信息
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(projectId) as Record<string, unknown>;

    // 获取项目素材
    const assets = db.prepare("SELECT * FROM assets WHERE project_id = ? ORDER BY sort_order").all(projectId) as Record<string, unknown>[];

    // 获取项目任务
    const tasks = db.prepare("SELECT * FROM tasks WHERE project_id = ? ORDER BY created_at DESC").all(projectId) as Record<string, unknown>[];

    // 构建清单
    const manifest: ProjectManifest = {
      schemaVersion: 2,
      cloudVersion: newVersion,
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

    // TOS 上传成功后更新推送时间
    // 版本号已在前面原子递增，即使此步失败，云端数据已是最新
    // 下次同步检查时会发现 cloud_ahead 并自动拉取
    db.prepare("UPDATE projects SET last_pushed_at = datetime('now', 'localtime') WHERE id = ?").run(projectId);

    return NextResponse.json({
      success: true,
      cloudVersion: newVersion,
      key,
      assetCount: assets.length,
      taskCount: tasks.length,
    });
  } catch (error) {
    console.error("POST /api/projects/sync error:", error);
    return NextResponse.json({ error: "推送失败: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

// GET /api/projects/sync - 检查云端更新状态
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

    // 读取每个 manifest 的基本信息和版本（限制并发数）
    const cloudProjects: {
      slug: string;
      name: string;
      exportedAt: string;
      cloudVersion: number;
      assetCount: number;
      taskCount: number;
      key: string;
    }[] = [];

    // 串行读取避免内存溢出，项目数一般不多
    for (const obj of manifestKeys) {
      try {
        const manifest = await getJson<ProjectManifest>(obj.key, config);
        cloudProjects.push({
          slug: manifest.project.slug,
          name: manifest.project.name,
          exportedAt: manifest.exportedAt,
          cloudVersion: manifest.cloudVersion || 0,
          assetCount: manifest.assets.length,
          taskCount: manifest.tasks.length,
          key: obj.key,
        });
      } catch (err) {
        console.error("Failed to read manifest:", obj.key, err);
      }
    }

    // 获取本地项目状态
    const db = getDb();
    const localProjects = db.prepare("SELECT id, name, slug, cloud_version, updated_at, last_pushed_at FROM projects").all() as {
      id: string; name: string; slug: string; cloud_version: number; updated_at: string; last_pushed_at: string | null;
    }[];
    const localBySlug = new Map(localProjects.map((p) => [p.slug, p]));

    type SyncStatus = "synced" | "local_ahead" | "cloud_ahead" | "conflict" | "cloud_only" | "local_only";

    const results: {
      slug: string;
      name: string;
      exportedAt: string;
      cloudVersion: number;
      assetCount: number;
      taskCount: number;
      key: string;
      isLocal: boolean;
      localId: string | null;
      localVersion: number;
      syncStatus: SyncStatus;
    }[] = [];

    // 处理云端项目
    for (const cp of cloudProjects) {
      const local = localBySlug.get(cp.slug);
      const isLocal = !!local;

      let syncStatus: SyncStatus = "cloud_only";
      if (local) {
        const localVersion = local.cloud_version || 0;
        const hasLocalChanges = !local.last_pushed_at || local.updated_at > local.last_pushed_at;

        if (localVersion === cp.cloudVersion) {
          syncStatus = hasLocalChanges ? "local_ahead" : "synced";
        } else if (localVersion < cp.cloudVersion) {
          syncStatus = hasLocalChanges ? "conflict" : "cloud_ahead";
        } else {
          syncStatus = "local_ahead";
        }
      }

      results.push({
        ...cp,
        isLocal,
        localId: local?.id || null,
        localVersion: local?.cloud_version || 0,
        syncStatus,
      });
    }

    // 加入只有本地没有云端的项目
    const cloudSlugs = new Set(cloudProjects.map((cp) => cp.slug));
    for (const local of localProjects) {
      if (!cloudSlugs.has(local.slug)) {
        const hasLocalChanges = !local.last_pushed_at || local.updated_at > local.last_pushed_at;
        results.push({
          slug: local.slug,
          name: local.name,
          exportedAt: "",
          cloudVersion: 0,
          assetCount: 0,
          taskCount: 0,
          key: "",
          isLocal: true,
          localId: local.id,
          localVersion: local.cloud_version || 0,
          syncStatus: hasLocalChanges ? "local_ahead" : "synced",
        });
      }
    }

    return NextResponse.json({ projects: results });
  } catch (error) {
    console.error("GET /api/projects/sync error:", error);
    return NextResponse.json({ error: "获取同步状态失败" }, { status: 500 });
  }
}

// PUT /api/projects/sync - 从云端拉取项目
export async function PUT(request: NextRequest) {
  try {
    const { key, tosConfig, forceOverwrite } = await request.json();

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

    // 检查本地是否已存在同名 slug
    const existing = db.prepare("SELECT id, cloud_version FROM projects WHERE slug = ?").get(manifest.project.slug) as { id: string; cloud_version: number } | undefined;
    if (existing) {
      const localVersion = existing.cloud_version || 0;
      const cloudVersion = manifest.cloudVersion || 0;

      // 即使强制覆盖，也不允许用旧版本覆盖新版本
      if (cloudVersion < localVersion) {
        return NextResponse.json({ error: "云端版本比本地旧，不允许覆盖", syncStatus: "local_ahead" }, { status: 409 });
      }

      if (cloudVersion === localVersion && !forceOverwrite) {
        return NextResponse.json({ error: "本地版本已是最新，无需拉取", syncStatus: "synced" }, { status: 409 });
      }

      if (!forceOverwrite) {
        const localProject = db.prepare("SELECT updated_at, last_pushed_at FROM projects WHERE id = ?").get(existing.id) as { updated_at: string; last_pushed_at: string | null };
        const hasLocalChanges = !localProject.last_pushed_at || localProject.updated_at > localProject.last_pushed_at;
        if (hasLocalChanges) {
          return NextResponse.json({
            error: "本地有未推送的变更，拉取将覆盖本地数据",
            syncStatus: "conflict",
            cloudVersion,
            localVersion,
          }, { status: 409 });
        }
      }

      // 使用事务确保原子性：删除旧数据 + 导入新数据
      const projectId = existing.id;
      const result = db.transaction(() => {
        // 删除旧的素材和任务
        db.prepare("DELETE FROM assets WHERE project_id = ?").run(projectId);
        db.prepare("DELETE FROM tasks WHERE project_id = ?").run(projectId);

        // 更新项目信息
        db.prepare("UPDATE projects SET name = ?, description = ?, cloud_version = ?, updated_at = datetime('now', 'localtime'), last_pushed_at = datetime('now', 'localtime') WHERE id = ?").run(
          manifest.project.name,
          manifest.project.description,
          manifest.cloudVersion || 0,
          projectId
        );

        // 导入素材和任务
        return importManifestData(db, manifest, projectId);
      })();

      return NextResponse.json({
        success: true,
        project: { id: projectId, name: manifest.project.name, slug: manifest.project.slug },
        importedAssets: result.importedAssets,
        importedTasks: result.importedTasks,
        cloudVersion: manifest.cloudVersion || 0,
      });
    }

    // 新建项目：同样使用事务
    const result = db.transaction(() => {
      const insertResult = db.prepare("INSERT INTO projects (name, slug, description, cloud_version, last_pushed_at) VALUES (?, ?, ?, ?, datetime('now', 'localtime')) RETURNING *").get(
        manifest.project.name,
        manifest.project.slug,
        manifest.project.description,
        manifest.cloudVersion || 0,
      ) as Record<string, unknown>;

      const projectId = insertResult.id as string;
      const { importedAssets, importedTasks } = importManifestData(db, manifest, projectId);

      return { project: insertResult, importedAssets, importedTasks };
    })();

    return NextResponse.json({
      success: true,
      project: result.project,
      importedAssets: result.importedAssets,
      importedTasks: result.importedTasks,
      cloudVersion: manifest.cloudVersion || 0,
    });
  } catch (error) {
    console.error("PUT /api/projects/sync error:", error);
    return NextResponse.json({ error: "拉取失败: " + (error instanceof Error ? error.message : String(error)) }, { status: 500 });
  }
}

/**
 * 从清单导入素材和任务到本地数据库
 * 注意：此函数必须在事务内调用
 */
function importManifestData(db: Database.Database, manifest: ProjectManifest, projectId: string): { importedAssets: number; importedTasks: number } {
  // 导入素材
  let importedAssets = 0;
  const assetIdMapping = new Map<string, string>();
  for (const asset of manifest.assets) {
    const row = db.prepare("INSERT INTO assets (project_id, name, display_name, type, asset_category, asset_id, is_keyframe, keyframe_description, keyframe_source_task_id, url, thumbnail_url, size, duration, storage_key, bound_audio_id, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id").get(
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
    ) as Record<string, unknown>;
    assetIdMapping.set(asset.id, row.id as string);
    importedAssets++;
  }

  // 更新 bound_audio_id 引用：旧 ID → 新 ID
  for (const [oldId, newId] of assetIdMapping.entries()) {
    db.prepare("UPDATE assets SET bound_audio_id = ? WHERE project_id = ? AND bound_audio_id = ?").run(newId, projectId, oldId);
  }

  // 导入任务（使用新 ID 避免主键冲突）
  let importedTasks = 0;
  const taskIdMapping = new Map<string, string>(); // 旧 task ID → 新 task ID
  for (const task of manifest.tasks) {
    // 更新 selected_assets 中的旧 asset ID 为新 ID
    let selectedAssets = task.selected_assets;
    try {
      const parsed = JSON.parse(selectedAssets) as string[];
      const updated = parsed.map((id: string) => assetIdMapping.get(id) || id);
      selectedAssets = JSON.stringify(updated);
    } catch {
      // 解析失败保持原样
    }

    // 更新 keyframe_source_task_id 中的旧 task ID 为新 ID
    // 注意：keyframe_source_task_id 字段在 assets 表中，不在 tasks 表中
    // 此处仅建立 task ID 映射，后续在所有任务导入完成后统一更新 assets

    // 生成新 ID，避免与本地已有任务主键冲突
    const newTaskId = (db.prepare("SELECT lower(hex(randomblob(16))) as id").get() as { id: string }).id;
    taskIdMapping.set(task.id, newTaskId);

    db.prepare("INSERT INTO tasks (id, project_id, task_id_external, status, model_mode, model_id, progress, prompt_boxes, selected_assets, params, result, error_message, permanent_video_url, video_storage_key, queued_at, started_at, completed_at, queue_duration, generation_duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
      newTaskId,
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

  // 更新 assets 中的 keyframe_source_task_id 引用：旧 task ID → 新 task ID
  for (const [oldTaskId, newTaskId] of taskIdMapping.entries()) {
    db.prepare("UPDATE assets SET keyframe_source_task_id = ? WHERE project_id = ? AND keyframe_source_task_id = ?").run(newTaskId, projectId, oldTaskId);
  }

  return { importedAssets, importedTasks };
}
