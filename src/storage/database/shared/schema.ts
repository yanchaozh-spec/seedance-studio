import { pgTable, serial, timestamp, index, varchar, foreignKey, text, integer, jsonb, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const projects = pgTable("projects", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	name: varchar({ length: 255 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("projects_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
]);

export const assets = pgTable("assets", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	projectId: varchar("project_id", { length: 36 }).notNull(),
	name: varchar({ length: 255 }).notNull(),
	displayName: varchar("display_name", { length: 100 }),
	type: varchar({ length: 10 }).notNull(),
	url: text().notNull(),
	thumbnailUrl: text("thumbnail_url"),
	boundAudioId: varchar("bound_audio_id", { length: 36 }),
	size: integer(),
	duration: integer(),
	voiceDescription: text("voice_description"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("assets_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("assets_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	index("assets_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "assets_project_id_fkey"
		}).onDelete("cascade"),
]);

export const tasks = pgTable("tasks", {
	id: varchar({ length: 64 }).primaryKey().notNull(),
	projectId: varchar("project_id", { length: 36 }).notNull(),
	status: varchar({ length: 20 }).default('queued').notNull(),
	progress: integer().default(0),
	promptBoxes: jsonb("prompt_boxes").default([]),
	selectedAssets: jsonb("selected_assets").default([]),
	params: jsonb(),
	result: jsonb(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("tasks_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("tasks_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	index("tasks_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "tasks_project_id_fkey"
		}).onDelete("cascade"),
]);

// 长视频任务表
export const longVideos = pgTable("long_videos", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	projectId: varchar("project_id", { length: 36 }).notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	progress: integer().default(0),
	totalSegments: integer("total_segments").notNull(),
	completedSegments: integer("completed_segments").default(0),
	finalVideoUrl: text("final_video_url"),
	finalVideoDuration: integer("final_video_duration"),
	targetDuration: integer("target_duration").notNull(),
	prompts: jsonb("prompts").default([]),
	selectedAssets: jsonb("selected_assets").default([]),
	params: jsonb(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("long_videos_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("long_videos_project_id_idx").using("btree", table.projectId.asc().nullsLast().op("text_ops")),
	index("long_videos_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.projectId],
			foreignColumns: [projects.id],
			name: "long_videos_project_id_fkey"
		}).onDelete("cascade"),
]);

// 视频分段表
export const videoSegments = pgTable("video_segments", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	longVideoId: varchar("long_video_id", { length: 36 }).notNull(),
	segmentIndex: integer("segment_index").notNull(),
	taskId: varchar("task_id", { length: 64 }),
	status: varchar({ length: 20 }).default('pending').notNull(),
	videoUrl: text("video_url"),
	lastFrameUrl: text("last_frame_url"),
	// 每段独立的提示词
	promptContent: jsonb("prompt_content"),
	// 每段独立的生成参数
	segmentDuration: integer("segment_duration").default(5),
	segmentRatio: varchar("segment_ratio", { length: 10 }).default("16:9"),
	segmentResolution: varchar("segment_resolution", { length: 10 }).default("720p"),
	segmentGenerateAudio: boolean("segment_generate_audio").default(true),
	// 首帧 URL（由上一段尾帧传入）
	firstFrameUrl: text("first_frame_url"),
	// 关联的素材 ID
	assetIds: jsonb("asset_ids").default([]),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("video_segments_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("video_segments_long_video_id_idx").using("btree", table.longVideoId.asc().nullsLast().op("text_ops")),
	index("video_segments_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	index("video_segments_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.longVideoId],
			foreignColumns: [longVideos.id],
			name: "video_segments_long_video_id_fkey"
		}).onDelete("cascade"),
]);
