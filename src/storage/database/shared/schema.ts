import { pgTable, serial, timestamp, index, varchar, foreignKey, text, integer, jsonb } from "drizzle-orm/pg-core"
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
