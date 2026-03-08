export type EntryType =
  | "webhook"
  | "email-api-call"
  | "email-api-response"
  | "llm-request"
  | "llm-response"
  | "chat-message"
  | "chat-step";

export interface RecordingEntry {
  duration?: number;
  label?: string;
  method?: string;
  platform?: "google" | "microsoft";
  request: unknown;
  response?: unknown;
  sequence: number;
  timestamp: string;
  type: EntryType;
}

export type FlowType = "webhook" | "chat";

export interface SessionMetadata {
  commitSha?: string;
  email: string;
  emailAccountId: string;
  flow: FlowType;
  startedAt: string;
}

export interface RecordingSession {
  entries: RecordingEntry[];
  id: string;
  metadata: SessionMetadata;
}

export interface ReplayFixture {
  entries: RecordingEntry[];
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
}
