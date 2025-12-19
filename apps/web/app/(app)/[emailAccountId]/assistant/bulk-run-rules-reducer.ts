export type ProcessingStatus = "idle" | "processing" | "paused" | "stopped";

export type BulkRunState = {
  status: ProcessingStatus;
  processedThreadIds: Set<string>;
  stoppedCount: number | null;
  runResult: { count: number } | null;
};

export type BulkRunAction =
  | { type: "START" }
  | { type: "THREADS_QUEUED"; ids: string[] }
  | { type: "COMPLETE"; count: number }
  | { type: "PAUSE" }
  | { type: "RESUME" }
  | { type: "STOP"; completedCount: number }
  | { type: "RESET" };

export const initialBulkRunState: BulkRunState = {
  status: "idle",
  processedThreadIds: new Set(),
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
        stoppedCount: null,
        runResult: null,
      };

    case "THREADS_QUEUED": {
      const next = new Set(state.processedThreadIds);
      for (const id of action.ids) {
        next.add(id);
      }
      return {
        ...state,
        processedThreadIds: next,
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
