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
