/**
 * SQLite 本地数据库客户端
 * 替代 Supabase，数据存储在本地文件中
 */
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// 数据库文件路径
const DB_DIR = process.env.COZE_WORKSPACE_PATH
  ? path.join(process.env.COZE_WORKSPACE_PATH, "data")
  : path.join(process.cwd(), "data");

const DB_PATH = path.join(DB_DIR, "app.db");

let _db: Database.Database | null = null;

/**
 * 获取数据库实例（单例）
 */
export function getDb(): Database.Database {
  if (_db) return _db;

  // 确保目录存在
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);

  // 启用 WAL 模式，提升并发性能
  _db.pragma("journal_mode = WAL");
  // 启用外键约束
  _db.pragma("foreign_keys = ON");

  // 初始化表结构
  initTables(_db);

  // 迁移：为已有数据库添加 asset_id 列
  migrate(_db);

  return _db;
}

/**
 * 数据库迁移
 */
function migrate(db: Database.Database): void {
  // 检查 assets 表是否有 asset_id 列
  const columns = db.prepare("PRAGMA table_info(assets)").all() as Array<{ name: string }>;
  const hasAssetId = columns.some((col) => col.name === "asset_id");
  if (!hasAssetId) {
    db.exec("ALTER TABLE assets ADD COLUMN asset_id TEXT");
  }
}

/**
 * 初始化数据库表
 */
function initTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name TEXT NOT NULL DEFAULT '',
      display_name TEXT,
      type TEXT NOT NULL DEFAULT 'image',
      asset_category TEXT DEFAULT 'image',
      asset_id TEXT,
      is_keyframe INTEGER DEFAULT 0,
      keyframe_description TEXT,
      keyframe_source_task_id TEXT,
      url TEXT NOT NULL DEFAULT '',
      thumbnail_url TEXT,
      size INTEGER,
      duration REAL,
      storage_key TEXT,
      bound_audio_id TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id_external TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      model_mode TEXT,
      model_id TEXT,
      progress INTEGER DEFAULT 0,
      prompt_boxes TEXT DEFAULT '[]',
      selected_assets TEXT DEFAULT '[]',
      params TEXT,
      result TEXT,
      error_message TEXT,
      api_key TEXT,
      queued_at TEXT,
      started_at TEXT,
      completed_at TEXT,
      queue_duration INTEGER,
      generation_duration INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      permanent_video_url TEXT,
      video_storage_key TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_assets_project_id ON assets(project_id);
    CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
    CREATE INDEX IF NOT EXISTS idx_assets_sort_order ON assets(project_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_task_id_external ON tasks(task_id_external);

    CREATE TABLE IF NOT EXISTS global_avatars (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      asset_id TEXT NOT NULL UNIQUE,
      thumbnail_url TEXT,
      description TEXT DEFAULT '',
      source_project_id TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_global_avatars_asset_id ON global_avatars(asset_id);
  `);
}

/**
 * 安全地将 JSON 字符串解析为对象
 */
export function parseJsonField<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * 将对象序列化为 JSON 字符串（用于存储）
 */
export function toJsonField(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return JSON.stringify(value);
}

/**
 * 关闭数据库连接
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
