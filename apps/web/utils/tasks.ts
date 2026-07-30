import type { TaskPriority, TaskStatus } from "@/generated/prisma/enums";

export type TaskListItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  completedAt: Date | null;
  assigneeEmail: string | null;
  parentId: string | null;
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

// Status colours as drawn in the Tasks Page v2 design: dot, its soft halo,
// and the border of an active status chip
export const TASK_STATUS_STYLES: Record<
  TaskStatus,
  { dot: string; ring: string; activeBorder: string }
> = {
  TODO: {
    dot: "bg-primary",
    ring: "ring-primary/15",
    activeBorder: "border-primary",
  },
  IN_PROGRESS: {
    dot: "bg-blue-400",
    ring: "ring-blue-400/15",
    activeBorder: "border-blue-400",
  },
  BLOCKED: {
    dot: "bg-red-400",
    ring: "ring-red-400/15",
    activeBorder: "border-red-400",
  },
  DONE: {
    dot: "bg-green-400",
    ring: "ring-green-400/15",
    activeBorder: "border-green-400",
  },
  CANCELLED: {
    dot: "bg-muted-foreground",
    ring: "ring-muted-foreground/15",
    activeBorder: "border-muted-foreground",
  },
};

export const TASK_PRIORITY_ORDER: TaskPriority[] = [
  "LOW",
  "NORMAL",
  "HIGH",
  "URGENT",
];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: "Low",
  NORMAL: "Normal",
  HIGH: "High",
  URGENT: "Urgent",
};

// Badge/chip tint per priority (background, text, inset ring)
export const TASK_PRIORITY_BADGE_CLASS: Record<TaskPriority, string> = {
  LOW: "bg-muted-foreground/10 text-muted-foreground ring-muted-foreground/25",
  NORMAL: "bg-muted-foreground/10 text-foreground/80 ring-muted-foreground/25",
  HIGH: "bg-yellow-400/10 text-yellow-500 ring-yellow-400/20 dark:text-yellow-400",
  URGENT: "bg-red-400/10 text-red-500 ring-red-400/20 dark:text-red-400",
};

// Selected priority chip in the drawer/dialog pickers
export const TASK_PRIORITY_CHIP_ACTIVE_CLASS: Record<TaskPriority, string> = {
  LOW: "border-muted-foreground bg-muted-foreground/10 text-muted-foreground",
  NORMAL: "border-muted-foreground bg-muted-foreground/10 text-foreground/80",
  HIGH: "border-yellow-400 bg-yellow-400/10 text-yellow-500 dark:text-yellow-400",
  URGENT: "border-red-400 bg-red-400/10 text-red-500 dark:text-red-400",
};

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

export type TaskDueBucket =
  | "overdue"
  | "today"
  | "tomorrow"
  | "week"
  | "later"
  | "nodue"
  | "done";

export const TASK_DUE_BUCKETS: { key: TaskDueBucket; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "later", label: "Later" },
  { key: "nodue", label: "No due date" },
  { key: "done", label: "Completed" },
];

// Which "group by due date" section a task lands in. Thresholds follow the
// design: anything inside 18h reads as today, inside 42h as tomorrow — a
// task due tomorrow morning shouldn't hide behind a midnight boundary.
export function taskDueBucket(
  task: Pick<TaskListItem, "status" | "dueAt">,
  now: Date = new Date(),
): TaskDueBucket {
  if (!isTaskOpen(task.status)) return "done";
  if (isTaskOverdue(task, now)) return "overdue";
  if (!task.dueAt) return "nodue";
  const days =
    (new Date(task.dueAt).getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
  if (days < 0.75) return "today";
  if (days < 1.75) return "tomorrow";
  if (days < 7) return "week";
  return "later";
}

// Short relative time as drawn in the design: "in 3h", "2d ago"
export function formatRelativeShort(
  date: Date | string,
  now: Date = new Date(),
): string {
  const ms = new Date(date).getTime() - now.getTime();
  const past = ms < 0;
  const abs = Math.abs(ms);
  const minutes = Math.round(abs / 60_000);
  const hours = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const span =
    minutes < 60 ? `${minutes}m` : hours < 36 ? `${hours}h` : `${days}d`;
  return past ? `${span} ago` : `in ${span}`;
}
