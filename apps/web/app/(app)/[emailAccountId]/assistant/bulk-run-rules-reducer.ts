import type { I18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import type { ThreadsResponse } from "@/app/api/threads/route";

type Thread = ThreadsResponse["threads"][number];

export type ProcessingStatus = "idle" | "processing" | "paused" | "stopped";

export type BulkRunState = {
  status: ProcessingStatus;
  processedThreadIds: Set<string>;
  // Stores fetched threads to ensure activity log can find them
  // (the global inbox cache may not contain all fetched threads)
  fetchedThreads: Map<string, Thread>;
  stoppedCount: number | null;
  runResult: { count: number } | null;
  // Set while the email provider is rate limiting the run.
  rateLimitResumeAt: Date | null;
};

export type BulkRunAction =
  | { type: "START" }
  | { type: "THREADS_QUEUED"; threads: Thread[] }
  | { type: "COMPLETE"; count: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP"; completedCount: number }
  | { type: "RATE_LIMIT_WAIT"; resumeAt: Date | null }
  | { type: "RESET" };

export const initialBulkRunState: BulkRunState = {
  status: "idle",
  processedThreadIds: new Set(),
  fetchedThreads: new Map(),
  stoppedCount: null,
  runResult: null,
  rateLimitResumeAt: null,
};

export function bulkRunReducer(
  state: BulkRunState,
  action: BulkRunAction,
): BulkRunState {
  switch (action.type) {
    case "START":
      return {
        ...state,
        status: "processing",
        processedThreadIds: new Set(),
        fetchedThreads: new Map(),
        stoppedCount: null,
        runResult: null,
        rateLimitResumeAt: null,
      };

    case "THREADS_QUEUED": {
      const nextIds = new Set(state.processedThreadIds);
      const nextThreads = new Map(state.fetchedThreads);
      for (const thread of action.threads) {
        nextIds.add(thread.id);
        nextThreads.set(thread.id, thread);
      }
      return {
        ...state,
        processedThreadIds: nextIds,
        fetchedThreads: nextThreads,
      };
    }

    case "COMPLETE":
      // Don't override stopped status
      if (state.status === "stopped") return state;

      return {
        ...state,
        status: "idle",
        runResult: { count: action.count },
        rateLimitResumeAt: null,
      };

    case "PAUSE":
      if (state.status !== "processing") return state;
      return {
        ...state,
        status: "paused",
      };

    case "RESUME":
      if (state.status !== "paused") return state;
      return {
        ...state,
        status: "processing",
      };

    case "STOP":
      // Don't override if already stopped
      if (state.status === "stopped") return state;
      return {
        ...state,
        status: "stopped",
        stoppedCount: action.completedCount,
        rateLimitResumeAt: null,
      };

    case "RATE_LIMIT_WAIT":
      if (action.resumeAt && !isRunActive(state.status)) return state;
      return {
        ...state,
        rateLimitResumeAt: action.resumeAt,
      };

    case "RESET":
      return initialBulkRunState;

    default:
      return state;
  }
}

export function getProgressMessage(
  state: BulkRunState,
  remaining: number,
  i18n: I18n,
): string | null {
  if (state.processedThreadIds.size === 0) return null;

  const completed = state.processedThreadIds.size - remaining;
  const total = state.processedThreadIds.size;

  if (remaining > 0) {
    return t(i18n)`Progress: ${completed}/${total} emails completed`;
  }

  if (state.status === "stopped" && state.stoppedCount !== null) {
    const stoppedCount = state.stoppedCount;
    return t(
      i18n,
    )`${plural(stoppedCount, { one: "Processed # email", other: "Processed # emails" })}`;
  }

  return t(
    i18n,
  )`${plural(total, { one: "Processed # email", other: "Processed # emails" })}`;
}

function isRunActive(status: ProcessingStatus) {
  return status === "processing" || status === "paused";
}
