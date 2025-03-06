// Define the steps of the flow
export enum CleanStep {
  INTRO = 0,
  ARCHIVE_OR_READ = 1,
  TIME_RANGE = 2,
  LABEL_OPTIONS = 3,
  FINAL_CONFIRMATION = 4,
  PROCESSING = 5,
}

// Define the time range options
export const timeRangeOptions = [
  { value: "1", label: "Older than 1 day" },
  { value: "7", label: "Older than 1 week", recommended: true },
  { value: "14", label: "Older than 2 weeks" },
  { value: "30", label: "Older than 1 month" },
];

// Email action types
export type EmailAction = "archive" | "mark-read";

// Job status types
export type JobStatus =
  | "INITIALIZING"
  | "STARTING"
  | "RUNNING"
  | "COMPLETED"
  | "CANCELLED"
  | "ERROR";

export interface Email {
  id: string;
  subject: string;
  from: string;
  timestamp: string;
  action: "archive" | "delete" | "label" | null;
  label?: string;
}

export interface EmailStats {
  total: number;
  inbox: number;
  archived: number;
  deleted: number;
  labeled: number;
  labels: Record<string, number>;
}
