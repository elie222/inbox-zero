import { redis } from "@/utils/redis";
import { createScopedLogger } from "@/utils/logger";
import type {
  EntryType,
  FlowType,
  RecordingEntry,
  SessionMetadata,
} from "./types";

const logger = createScopedLogger("replay-recorder");

const SESSION_TTL_SECONDS = 24 * 60 * 60; // 24 hours
const REDIS_PREFIX = "replay:session:";

let recordingEnabled: boolean | undefined;

function isRecordingEnabled(): boolean {
  if (recordingEnabled === undefined) {
    recordingEnabled = process.env.REPLAY_RECORDING_ENABLED === "true";
  }
  return recordingEnabled;
}

function generateSessionId(): string {
  const sha =
    process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
    "local";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 8);
  return `session-${sha}-${timestamp}-${random}`;
}

export function createRecordingSession(
  flow: FlowType,
  email: string,
  emailAccountId: string,
): RecordingSessionHandle | null {
  if (!isRecordingEnabled()) return null;

  const id = generateSessionId();
  const metadata: SessionMetadata = {
    flow,
    email,
    emailAccountId,
    commitSha:
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    startedAt: new Date().toISOString(),
  };

  return new RecordingSessionHandle(id, metadata);
}

export class RecordingSessionHandle {
  readonly id: string;
  private readonly metadata: SessionMetadata;
  private sequence = 0;

  constructor(id: string, metadata: SessionMetadata) {
    this.id = id;
    this.metadata = metadata;
  }

  async record(
    type: EntryType,
    data: {
      platform?: "google" | "microsoft";
      label?: string;
      method?: string;
      request: unknown;
      response?: unknown;
      duration?: number;
    },
  ): Promise<void> {
    const entry: RecordingEntry = {
      type,
      timestamp: new Date().toISOString(),
      sequence: this.sequence++,
      ...data,
    };

    try {
      const key = `${REDIS_PREFIX}${this.id}`;

      if (entry.sequence === 0) {
        await redis.set(`${key}:meta`, JSON.stringify(this.metadata), {
          ex: SESSION_TTL_SECONDS,
        });
      }

      await redis.rpush(key, JSON.stringify(entry));
      await redis.expire(key, SESSION_TTL_SECONDS);
    } catch (error) {
      logger.error("Failed to record replay entry", {
        sessionId: this.id,
        type,
        error,
      });
    }
  }
}

// --- Convenience helpers for recording entry points ---

export async function recordWebhookEntry(
  platform: "google" | "microsoft",
  email: string,
  request: unknown,
): Promise<RecordingSessionHandle | null> {
  const session = createRecordingSession("webhook", email, "pending");
  if (!session) return null;

  await session.record("webhook", { platform, request });
  return session;
}

export async function recordChatEntry(
  email: string,
  emailAccountId: string,
  message: unknown,
): Promise<RecordingSessionHandle | null> {
  const session = createRecordingSession("chat", email, emailAccountId);
  if (!session) return null;

  await session.record("chat-message", { request: message });
  return session;
}

// --- CLI helpers (used by scripts) ---

export async function listSessions(): Promise<
  Array<{ id: string; metadata: SessionMetadata; entryCount: number }>
> {
  const metaKeys = await redis.keys(`${REDIS_PREFIX}*:meta`);
  const sessions: Array<{
    id: string;
    metadata: SessionMetadata;
    entryCount: number;
  }> = [];

  for (const metaKey of metaKeys) {
    const sessionId = metaKey.replace(REDIS_PREFIX, "").replace(":meta", "");
    const metaRaw = await redis.get<string>(metaKey);
    if (!metaRaw) continue;

    const metadata =
      typeof metaRaw === "string"
        ? (JSON.parse(metaRaw) as SessionMetadata)
        : (metaRaw as SessionMetadata);
    const entryCount = await redis.llen(`${REDIS_PREFIX}${sessionId}`);

    sessions.push({ id: sessionId, metadata, entryCount });
  }

  return sessions.sort(
    (a, b) =>
      new Date(b.metadata.startedAt).getTime() -
      new Date(a.metadata.startedAt).getTime(),
  );
}

export async function exportSession(
  sessionId: string,
): Promise<{ metadata: SessionMetadata; entries: RecordingEntry[] } | null> {
  const metaRaw = await redis.get<string>(`${REDIS_PREFIX}${sessionId}:meta`);
  if (!metaRaw) return null;

  const metadata =
    typeof metaRaw === "string"
      ? (JSON.parse(metaRaw) as SessionMetadata)
      : (metaRaw as SessionMetadata);
  const entriesRaw = await redis.lrange(`${REDIS_PREFIX}${sessionId}`, 0, -1);

  const entries = entriesRaw.map((raw) =>
    typeof raw === "string"
      ? (JSON.parse(raw) as RecordingEntry)
      : (raw as RecordingEntry),
  );

  return { metadata, entries };
}
