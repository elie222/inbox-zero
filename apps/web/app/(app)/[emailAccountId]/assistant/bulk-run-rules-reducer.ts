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
};

export type BulkRunAction =
  | { type: "START" }
  | { type: "THREADS_QUEUED"; threads: Thread[] }
  | { type: "COMPLETE"; count: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP"; completedCount: number }
  | { type: "RESET" };

export const initialBulkRunState: BulkRunState = {
  status: "idle",
  processedThreadIds: new Set(),
  fetchedThreads: new Map(),
  stoppedCount: null,
  runResult: null,
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

      // No emails found - go back to idle
      if (action.count === 0) {
        return {
          ...state,
          status: "idle",
          runResult: { count: 0 },
        };
      }

      // Keep current status (processing or paused)
      return state;

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
): string | null {
  if (state.processedThreadIds.size === 0) return null;

  const completed = state.processedThreadIds.size - remaining;

  if (remaining > 0) {
    return `Progress: ${completed}/${state.processedThreadIds.size} emails completed`;
  }

  if (state.status === "stopped" && state.stoppedCount !== null) {
    return `Processed ${state.stoppedCount} emails`;
  }

  return `Processed ${state.processedThreadIds.size} emails`;
}
