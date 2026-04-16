import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean, integer, jsonb, index } from "drizzle-orm/pg-core";
import { createSchemaFactory } from "drizzle-zod";
import { z } from "zod";

// 项目表
export const projects = pgTable(
  "projects",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 255 }).notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("projects_created_at_idx").on(table.created_at),
  ]
);

// 素材表（图片和音频统一存储）
export const assets = pgTable(
  "assets",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    project_id: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),          // 原始文件名
    display_name: varchar("display_name", { length: 100 }),   // 显示名称（如图1、音频1）
    type: varchar("type", { length: 10 }).notNull(),           // 'image' | 'audio'
    url: text("url").notNull(),                                // 访问 URL
    thumbnail_url: text("thumbnail_url"),                      // 缩略图（仅图片）
    bound_audio_id: varchar("bound_audio_id", { length: 36 }), // 绑定的音频 ID
    size: integer("size"),                                     // 文件大小（字节）
    duration: integer("duration"),                             // 音频时长（秒）
    voice_description: text("voice_description"),              // 声线描述
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("assets_project_id_idx").on(table.project_id),      // 外键索引
    index("assets_type_idx").on(table.type),                    // 按类型筛选
    index("assets_created_at_idx").on(table.created_at),        // 排序
  ]
);

// 任务表
export const tasks = pgTable(
  "tasks",
  {
    id: varchar("id", { length: 64 }).primaryKey(),             // API 返回的任务 ID
    project_id: varchar("project_id", { length: 36 }).notNull().references(() => projects.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 20 }).notNull().default("queued"), // 'queued' | 'running' | 'succeeded' | 'failed'
    progress: integer("progress").default(0),                    // 0-100
    // 生成时的快照数据
    prompt_boxes: jsonb("prompt_boxes").$type<{
      id: string;
      content: string;
      is_activated: boolean;
      activated_asset_id?: string;
      order: number;
    }[]>().default([]),
    selected_assets: jsonb("selected_assets").$type<string[]>().default([]), // 选中的素材 ID 数组
    params: jsonb("params").$type<{
      duration: number;
      ratio: string;
      resolution: string;
    }>(),
    // 生成结果
    result: jsonb("result").$type<{
      video_url: string;
      resolution: string;
      duration: number;
    }>(),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tasks_project_id_idx").on(table.project_id),        // 外键索引
    index("tasks_status_idx").on(table.status),                 // 按状态筛选
    index("tasks_created_at_idx").on(table.created_at),        // 排序
  ]
);

// Zod Schema
const { createInsertSchema: createProjectInsertSchema } = createSchemaFactory({ coerce: { date: true } });
export const insertProjectSchema = createProjectInsertSchema(projects).pick({ name: true });
export type Project = typeof projects.$inferSelect;
export type InsertProject = z.infer<typeof insertProjectSchema>;

export const insertAssetSchema = createProjectInsertSchema(assets).omit({ id: true, created_at: true });
export type Asset = typeof assets.$inferSelect;
export type InsertAsset = z.infer<typeof insertAssetSchema>;

export const insertTaskSchema = createProjectInsertSchema(tasks).omit({ id: true, created_at: true, updated_at: true });
export type Task = typeof tasks.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
