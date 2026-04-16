import { relations } from "drizzle-orm/relations";
import { projects, assets, tasks, longVideos, videoSegments } from "./schema";

export const assetsRelations = relations(assets, ({one}) => ({
	project: one(projects, {
		fields: [assets.projectId],
		references: [projects.id]
	}),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	assets: many(assets),
	tasks: many(tasks),
	longVideos: many(longVideos),
}));

export const tasksRelations = relations(tasks, ({one}) => ({
	project: one(projects, {
		fields: [tasks.projectId],
		references: [projects.id]
	}),
}));

export const longVideosRelations = relations(longVideos, ({one, many}) => ({
	project: one(projects, {
		fields: [longVideos.projectId],
		references: [projects.id]
	}),
	segments: many(videoSegments),
}));

export const videoSegmentsRelations = relations(videoSegments, ({one}) => ({
	longVideo: one(longVideos, {
		fields: [videoSegments.longVideoId],
		references: [longVideos.id]
	}),
}));