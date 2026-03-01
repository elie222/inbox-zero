export type EntryType =
  | "webhook"
  | "email-api-call"
  | "email-api-response"
  | "llm-request"
  | "llm-response"
  | "chat-message"
  | "chat-step";

export interface RecordingEntry {
  type: EntryType;
  timestamp: string;
  sequence: number;
  platform?: "google" | "microsoft";
  label?: string;
  method?: string;
  request: unknown;
  response?: unknown;
  duration?: number;
}

export type FlowType = "webhook" | "chat";

export interface SessionMetadata {
  flow: FlowType;
  email: string;
  emailAccountId: string;
  commitSha?: string;
  startedAt: string;
}

export interface RecordingSession {
  id: string;
  metadata: SessionMetadata;
  entries: RecordingEntry[];
}

export interface ReplayFixture {
  metadata: {
    description: string;
    flow: FlowType;
    recordedAt: string;
    commitSha?: string;
  };
  setup: {
    emailAccount?: Record<string, unknown>;
    rules?: unknown[];
  };
  entries: RecordingEntry[];
}
