// apps/web/utils/chief-of-staff/types.ts

export enum CosCategory {
  SCHEDULING = "scheduling",
  SCHEDULING_CANCEL = "scheduling_cancel",
  CLIENT_PARENT = "client_parent",
  BUSINESS = "business",
  URGENT = "urgent",
  NOTIFICATION = "notification",
  LOW_PRIORITY = "low_priority",
}

export enum AutonomyMode {
  AUTO_HANDLE = "auto_handle",
  DRAFT_APPROVE = "draft_approve",
  FLAG_ONLY = "flag_only",
}

export enum Venture {
  SMART_COLLEGE = "smart_college",
  PRAXIS = "praxis",
  PERSONAL = "personal",
}

export enum PreFilterResult {
  PROCESS = "process",
  SKIP = "skip",
  BATCH_SUMMARY = "batch_summary",
  CREATE_CALENDAR_EVENT = "create_calendar_event",
}

export enum FilterReason {
  GMAIL_CATEGORY = "gmail_category",
  BLOCKLIST = "blocklist",
  MAILING_LIST = "mailing_list",
  BOUNCE = "bounce",
  SHIPPING = "shipping",
  BATCH_SUMMARY = "batch_summary",
}

export enum ProcessedEmailStatus {
  PROCESSING = "processing",
  COMPLETED = "completed",
  FAILED = "failed",
  DEAD_LETTER = "dead_letter",
}

export enum DraftStatus {
  PENDING = "pending",
  APPROVED = "approved",
  EDITED = "edited",
  REJECTED = "rejected",
}

export enum ClientGroupSource {
  AUTO = "auto",
  MANUAL = "manual",
}

export interface CalendarConflict {
  title: string;
  calendar: string;
  start: string;
  end: string;
}

export interface CalendarAvailability {
  available: boolean;
  hardBlocks: CalendarConflict[];
  softConflicts: CalendarConflict[];
}

export interface CosEngineResponse {
  category: CosCategory;
  summary: string;
  actionTaken: string | null;
  draft: {
    to: string;
    subject: string;
    body: string;
    gmailDraftId: string;
    gmailThreadId: string;
  } | null;
  needsApproval: boolean;
  conflicts: CalendarConflict[];
  isVip: boolean;
  vipGroupName: string | null;
}

export interface EmailMetadata {
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: Date;
  labels: string[];
  category: string | null;
  headers: Record<string, string>;
  snippet: string;
  body: string;
}

export const CATEGORY_ICONS: Record<CosCategory, string> = {
  [CosCategory.SCHEDULING]: "\u{1F5D3}\uFE0F",
  [CosCategory.SCHEDULING_CANCEL]: "\u{1F5D3}\uFE0F",
  [CosCategory.CLIENT_PARENT]: "\u{1F468}\u200D\u{1F469}\u200D\u{1F466}",
  [CosCategory.BUSINESS]: "\u{1F4BC}",
  [CosCategory.URGENT]: "\u{1F6A8}",
  [CosCategory.NOTIFICATION]: "\u{1F514}",
  [CosCategory.LOW_PRIORITY]: "\u{1F4EC}",
};

export const DEFAULT_AUTONOMY_LEVELS: Record<CosCategory, AutonomyMode> = {
  [CosCategory.SCHEDULING]: AutonomyMode.AUTO_HANDLE,
  [CosCategory.SCHEDULING_CANCEL]: AutonomyMode.DRAFT_APPROVE,
  [CosCategory.CLIENT_PARENT]: AutonomyMode.DRAFT_APPROVE,
  [CosCategory.BUSINESS]: AutonomyMode.DRAFT_APPROVE,
  [CosCategory.URGENT]: AutonomyMode.FLAG_ONLY,
  [CosCategory.NOTIFICATION]: AutonomyMode.AUTO_HANDLE,
  [CosCategory.LOW_PRIORITY]: AutonomyMode.AUTO_HANDLE,
};

export const TIMEZONE = "America/Chicago";
export const VIP_THRESHOLD = 5;
export const TUTORING_RATE = 130;
export const MAX_RETRY_COUNT = 3;
export const BATCH_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

export const CALENDAR_IDS = {
  personal: "leekenick@gmail.com",
  smartCollege:
    "cde6ed85e99649430c4821064c4345f4f3b8024376925307ccca79003985651a@group.calendar.google.com",
  rmsWork: "nicholas.leeke@rpsmn.org",
  praxis:
    "4ef466c3edc216afb1655ea0f4e76cd45f141eeb48838b9a07bb472e024fa683@group.calendar.google.com",
  nutrition:
    "20f52ebce7cb1491b520eb940509c3031d14f1b782fc678c9e00d0a2ba737d1a@group.calendar.google.com",
  workout:
    "2b8c2dda0d66dd8f3fa70ad259bf94a7e7827bcbe2fe81434d3d96531cb6bd84@group.calendar.google.com",
} as const;

// Calendars whose events are always treated as soft/movable
export const SOFT_CALENDARS = new Set([
  CALENDAR_IDS.nutrition,
  CALENDAR_IDS.workout,
]);
