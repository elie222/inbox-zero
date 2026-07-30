import { z } from "zod";
import { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

const emailOrEmpty = z.string().email().or(z.literal(""));

export const createTaskBody = z.object({
  title: z.string().trim().min(1).max(500),
  description: z.string().max(10_000).nullish(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.string().datetime().nullish(),
  assigneeEmail: emailOrEmpty.nullish(),
  // Makes the new task a subtask (one level deep; enforced in the action)
  parentId: z.string().min(1).nullish(),
  sourceThreadId: z.string().max(200).nullish(),
  sourceMessageId: z.string().max(200).nullish(),
  // Turning on follow-up requires an assignee (enforced in the action)
  followUpEnabled: z.boolean().optional(),
  followUpCadenceDays: z.number().int().min(1).max(90).optional(),
});
export type CreateTaskBody = z.infer<typeof createTaskBody>;

export const updateTaskBody = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(500).optional(),
  description: z.string().max(10_000).nullish(),
  status: z.nativeEnum(TaskStatus).optional(),
  priority: z.nativeEnum(TaskPriority).optional(),
  dueAt: z.string().datetime().nullish(),
  assigneeEmail: emailOrEmpty.nullish(),
  followUpEnabled: z.boolean().optional(),
  followUpCadenceDays: z.number().int().min(1).max(90).optional(),
});
export type UpdateTaskBody = z.infer<typeof updateTaskBody>;

export const deleteTaskBody = z.object({
  id: z.string().min(1),
});
export type DeleteTaskBody = z.infer<typeof deleteTaskBody>;

export const addTaskNoteBody = z.object({
  taskId: z.string().min(1),
  content: z.string().trim().min(1).max(10_000),
});
export type AddTaskNoteBody = z.infer<typeof addTaskNoteBody>;

// Display fields come from the client's already-loaded message list; they
// are cached for rendering, the message itself stays with the provider
export const linkTaskEmailBody = z.object({
  taskId: z.string().min(1),
  threadId: z.string().min(1).max(200),
  messageId: z.string().min(1).max(200),
  from: z.string().trim().min(1).max(500),
  subject: z.string().trim().max(1000),
  snippet: z.string().max(2000).nullish(),
  receivedAt: z.string().datetime().nullish(),
});
export type LinkTaskEmailBody = z.infer<typeof linkTaskEmailBody>;

export const unlinkTaskEmailBody = z.object({
  id: z.string().min(1),
});
export type UnlinkTaskEmailBody = z.infer<typeof unlinkTaskEmailBody>;

// Bulk bar over the task list: complete, delete, or nudge the assignees of
// the selected tasks
export const bulkTasksBody = z.object({
  ids: z.array(z.string().min(1)).min(1).max(200),
  op: z.enum(["done", "delete", "nudge"]),
});
export type BulkTasksBody = z.infer<typeof bulkTasksBody>;

export const refreshTaskOverviewBody = z.object({
  id: z.string().min(1),
});
export type RefreshTaskOverviewBody = z.infer<typeof refreshTaskOverviewBody>;
