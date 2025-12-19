import { describe, it, expect } from "vitest";
import {
  bulkRunReducer,
  getProgressMessage,
  initialBulkRunState,
  type BulkRunState,
} from "./bulk-run-rules-reducer";

describe("bulkRunReducer", () => {
  describe("START action", () => {
    it("transitions from idle to processing", () => {
      const result = bulkRunReducer(initialBulkRunState, { type: "START" });

      expect(result.status).toBe("processing");
      expect(result.processedThreadIds.size).toBe(0);
      expect(result.stoppedCount).toBeNull();
      expect(result.runResult).toBeNull();
    });

    it("clears previous state when starting again", () => {
      const stateWithData: BulkRunState = {
        status: "stopped",
        processedThreadIds: new Set(["thread1", "thread2"]),
        stoppedCount: 2,
        runResult: { count: 5 },
      };

      const result = bulkRunReducer(stateWithData, { type: "START" });

      expect(result.status).toBe("processing");
      expect(result.processedThreadIds.size).toBe(0);
      expect(result.stoppedCount).toBeNull();
      expect(result.runResult).toBeNull();
    });
  });

  describe("THREADS_QUEUED action", () => {
    it("adds thread IDs to the set", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };

      const result = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        ids: ["thread1", "thread2"],
      });

      expect(result.processedThreadIds.size).toBe(2);
      expect(result.processedThreadIds.has("thread1")).toBe(true);
      expect(result.processedThreadIds.has("thread2")).toBe(true);
    });

    it("accumulates thread IDs across multiple calls", () => {
      let state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };

      state = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        ids: ["thread1", "thread2"],
      });
      state = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        ids: ["thread3"],
      });

      expect(state.processedThreadIds.size).toBe(3);
      expect(state.processedThreadIds.has("thread1")).toBe(true);
      expect(state.processedThreadIds.has("thread3")).toBe(true);
    });

    it("does not duplicate existing thread IDs", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
        processedThreadIds: new Set(["thread1"]),
      };

      const result = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        ids: ["thread1", "thread2"],
      });

      expect(result.processedThreadIds.size).toBe(2);
    });
  });

  describe("COMPLETE action", () => {
    it("transitions to idle when count is 0 (no emails found)", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };

      const result = bulkRunReducer(state, { type: "COMPLETE", count: 0 });

      expect(result.status).toBe("idle");
      expect(result.runResult).toEqual({ count: 0 });
    });

    it("stays in processing state when count > 0", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
        processedThreadIds: new Set(["thread1"]),
      };

      const result = bulkRunReducer(state, { type: "COMPLETE", count: 5 });

      expect(result.status).toBe("processing");
    });

    it("does not override stopped status", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "stopped",
        stoppedCount: 3,
      };

      const result = bulkRunReducer(state, { type: "COMPLETE", count: 0 });

      expect(result.status).toBe("stopped");
      expect(result.stoppedCount).toBe(3);
    });

    it("preserves paused status when count > 0", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "paused",
        processedThreadIds: new Set(["thread1"]),
      };

      const result = bulkRunReducer(state, { type: "COMPLETE", count: 5 });

      expect(result.status).toBe("paused");
    });
  });

  describe("PAUSE action", () => {
    it("transitions from processing to paused", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };

      const result = bulkRunReducer(state, { type: "PAUSE" });

      expect(result.status).toBe("paused");
    });

    it("does nothing if not in processing state", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "idle",
      };

      const result = bulkRunReducer(state, { type: "PAUSE" });

      expect(result.status).toBe("idle");
    });

    it("does nothing if already paused", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "paused",
      };

      const result = bulkRunReducer(state, { type: "PAUSE" });

      expect(result.status).toBe("paused");
    });
  });

  describe("RESUME action", () => {
    it("transitions from paused to processing", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "paused",
      };

      const result = bulkRunReducer(state, { type: "RESUME" });

      expect(result.status).toBe("processing");
    });

    it("does nothing if not in paused state", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };

      const result = bulkRunReducer(state, { type: "RESUME" });

      expect(result.status).toBe("processing");
    });
  });

  describe("STOP action", () => {
    it("transitions to stopped and captures completed count", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
        processedThreadIds: new Set(["t1", "t2", "t3", "t4", "t5"]),
      };

      const result = bulkRunReducer(state, {
        type: "STOP",
        completedCount: 3,
      });

      expect(result.status).toBe("stopped");
      expect(result.stoppedCount).toBe(3);
    });

    it("does not override if already stopped", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "stopped",
        stoppedCount: 5,
      };

      const result = bulkRunReducer(state, {
        type: "STOP",
        completedCount: 10,
      });

      expect(result.status).toBe("stopped");
      expect(result.stoppedCount).toBe(5);
    });

    it("works when stopping from paused state", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "paused",
      };

      const result = bulkRunReducer(state, {
        type: "STOP",
        completedCount: 8,
      });

      expect(result.status).toBe("stopped");
      expect(result.stoppedCount).toBe(8);
    });
  });

  describe("RESET action", () => {
    it("resets all state to initial values", () => {
      const state: BulkRunState = {
        status: "stopped",
        processedThreadIds: new Set(["t1", "t2"]),
        stoppedCount: 5,
        runResult: { count: 10 },
      };

      const result = bulkRunReducer(state, { type: "RESET" });

      expect(result.status).toBe("idle");
      expect(result.processedThreadIds.size).toBe(0);
      expect(result.stoppedCount).toBeNull();
      expect(result.runResult).toBeNull();
    });
  });
});

describe("getProgressMessage", () => {
  it("returns null when no emails processed", () => {
    const state: BulkRunState = {
      ...initialBulkRunState,
      status: "processing",
    };

    const result = getProgressMessage(state, 0);

    expect(result).toBeNull();
  });

  it("shows progress during processing with remaining items", () => {
    const state: BulkRunState = {
      ...initialBulkRunState,
      status: "processing",
      processedThreadIds: new Set(["t1", "t2", "t3", "t4", "t5"]),
    };

    const result = getProgressMessage(state, 3);

    expect(result).toBe("Progress: 2/5 emails completed");
  });

  it("shows stoppedCount after stop", () => {
    const state: BulkRunState = {
      ...initialBulkRunState,
      status: "stopped",
      processedThreadIds: new Set(["t1", "t2", "t3", "t4", "t5"]),
      stoppedCount: 3,
    };

    const result = getProgressMessage(state, 0);

    expect(result).toBe("Processed 3 emails");
  });

  it("shows total on completion", () => {
    const state: BulkRunState = {
      ...initialBulkRunState,
      status: "idle",
      processedThreadIds: new Set(["t1", "t2", "t3", "t4", "t5"]),
    };

    const result = getProgressMessage(state, 0);

    expect(result).toBe("Processed 5 emails");
  });

  it("shows progress when paused", () => {
    const state: BulkRunState = {
      ...initialBulkRunState,
      status: "paused",
      processedThreadIds: new Set(["t1", "t2", "t3", "t4"]),
    };

    const result = getProgressMessage(state, 2);

    expect(result).toBe("Progress: 2/4 emails completed");
  });
});
