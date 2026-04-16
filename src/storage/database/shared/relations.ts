import { relations } from "drizzle-orm/relations";
import { projects, assets, tasks } from "./schema";

export const assetsRelations = relations(assets, ({one}) => ({
	project: one(projects, {
		fields: [assets.projectId],
		references: [projects.id]
	}),
}));

export const projectsRelations = relations(projects, ({many}) => ({
	assets: many(assets),
	tasks: many(tasks),
}));

export const tasksRelations = relations(tasks, ({one}) => ({
	project: one(projects, {
		fields: [tasks.projectId],
		references: [projects.id]
	}),
}));