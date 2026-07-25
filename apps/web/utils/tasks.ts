import type {
  TaskActivityType,
  TaskPriority,
  TaskStatus,
} from "@/generated/prisma/enums";

export type TaskActivityItem = {
  id: string;
  type: TaskActivityType;
  content: string;
  threadId: string | null;
  messageId: string | null;
  createdAt: Date;
};

export type TaskListItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  completedAt: Date | null;
  assigneeEmail: string | null;
  sourceThreadId: string | null;
  sourceMessageId: string | null;
  aiStatusSummary: string | null;
  followUpEnabled: boolean;
  followUpCadenceDays: number;
  lastFollowUpAt: Date | null;
  nextFollowUpAt: Date | null;
  followUpCount: number;
  createdAt: Date;
  updatedAt: Date;
};

// Order used everywhere status appears (sidebar groups, sorting)
export const TASK_STATUS_ORDER: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
  "DONE",
  "CANCELLED",
];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const OPEN_TASK_STATUSES: TaskStatus[] = [
  "TODO",
  "IN_PROGRESS",
  "BLOCKED",
];

export function isTaskOpen(status: TaskStatus): boolean {
  return status !== "DONE" && status !== "CANCELLED";
}

// A task is overdue when it's still open and its due date has passed
export function isTaskOverdue(
  task: Pick<TaskListItem, "status" | "dueAt">,
  now: Date = new Date(),
): boolean {
  if (!task.dueAt || !isTaskOpen(task.status)) return false;
  return new Date(task.dueAt) < now;
}

// When the next follow-up is due after sending one now
export function nextFollowUpFrom(cadenceDays: number, now: Date): Date {
  return new Date(now.getTime() + cadenceDays * 24 * 60 * 60 * 1000);
}
