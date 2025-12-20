import { describe, it, expect } from "vitest";
import {
  bulkRunReducer,
  getProgressMessage,
  initialBulkRunState,
  type BulkRunState,
} from "./bulk-run-rules-reducer";
import type { ThreadsResponse } from "@/app/api/threads/route";

// Helper to create mock threads
function createMockThread(id: string): ThreadsResponse["threads"][number] {
  return {
    id,
    snippet: "Test snippet",
    messages: [
      {
        id: `${id}-msg`,
        historyId: "123",
        threadId: id,
        labelIds: ["INBOX"],
        headers: {
          from: "test@test.com",
          to: "recipient@test.com",
          subject: "Test",
          date: "2024-01-01",
        },
        textPlain: "",
        textHtml: "",
        snippet: "",
        inline: [],
        internalDate: "123",
        subject: "Test",
        date: "2024-01-01",
      },
    ],
    plan: undefined,
  };
}

describe("bulkRunReducer", () => {
  describe("START action", () => {
    it("transitions from idle to processing", () => {
      const result = bulkRunReducer(initialBulkRunState, { type: "START" });

      expect(result.status).toBe("processing");
      expect(result.processedThreadIds.size).toBe(0);
      expect(result.fetchedThreads.size).toBe(0);
      expect(result.stoppedCount).toBeNull();
      expect(result.runResult).toBeNull();
    });

    it("clears previous state when starting again", () => {
      const thread = createMockThread("thread1");
      const stateWithData: BulkRunState = {
        status: "stopped",
        processedThreadIds: new Set(["thread1", "thread2"]),
        fetchedThreads: new Map([["thread1", thread]]),
        stoppedCount: 2,
        runResult: { count: 5 },
      };

      const result = bulkRunReducer(stateWithData, { type: "START" });

      expect(result.status).toBe("processing");
      expect(result.processedThreadIds.size).toBe(0);
      expect(result.fetchedThreads.size).toBe(0);
      expect(result.stoppedCount).toBeNull();
      expect(result.runResult).toBeNull();
    });
  });

  describe("THREADS_QUEUED action", () => {
    it("adds thread IDs and threads to state", () => {
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };
      const threads = [
        createMockThread("thread1"),
        createMockThread("thread2"),
      ];

      const result = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        threads,
      });

      expect(result.processedThreadIds.size).toBe(2);
      expect(result.processedThreadIds.has("thread1")).toBe(true);
      expect(result.processedThreadIds.has("thread2")).toBe(true);
      expect(result.fetchedThreads.size).toBe(2);
      expect(result.fetchedThreads.get("thread1")).toBe(threads[0]);
      expect(result.fetchedThreads.get("thread2")).toBe(threads[1]);
    });

    it("accumulates threads across multiple calls", () => {
      let state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };
      const threads1 = [
        createMockThread("thread1"),
        createMockThread("thread2"),
      ];
      const threads2 = [createMockThread("thread3")];

      state = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        threads: threads1,
      });
      state = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        threads: threads2,
      });

      expect(state.processedThreadIds.size).toBe(3);
      expect(state.processedThreadIds.has("thread1")).toBe(true);
      expect(state.processedThreadIds.has("thread3")).toBe(true);
      expect(state.fetchedThreads.size).toBe(3);
    });

    it("does not duplicate existing thread IDs", () => {
      const existingThread = createMockThread("thread1");
      const state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
        processedThreadIds: new Set(["thread1"]),
        fetchedThreads: new Map([["thread1", existingThread]]),
      };
      const newThreads = [
        createMockThread("thread1"),
        createMockThread("thread2"),
      ];

      const result = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        threads: newThreads,
      });

      expect(result.processedThreadIds.size).toBe(2);
      expect(result.fetchedThreads.size).toBe(2);
    });

    it("allows lookup of any queued thread by ID (fixes inbox cache mismatch)", () => {
      // This test validates the fix for the bug where threads fetched during
      // bulk processing might not exist in the global inbox cache, causing
      // activity log entries to be silently skipped.
      let state: BulkRunState = {
        ...initialBulkRunState,
        status: "processing",
      };

      // Simulate multiple batches of threads being fetched (paginated)
      const batch1 = [createMockThread("old-thread-1")];
      const batch2 = [createMockThread("old-thread-2")];
      const batch3 = [createMockThread("recent-thread")];

      state = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        threads: batch1,
      });
      state = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        threads: batch2,
      });
      state = bulkRunReducer(state, {
        type: "THREADS_QUEUED",
        threads: batch3,
      });

      // All threads should be retrievable by ID, even old ones
      // that wouldn't be in a typical inbox cache
      for (const threadId of state.processedThreadIds) {
        const thread = state.fetchedThreads.get(threadId);
        expect(thread).toBeDefined();
        expect(thread?.id).toBe(threadId);
      }
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
      const thread = createMockThread("t1");
      const state: BulkRunState = {
        status: "stopped",
        processedThreadIds: new Set(["t1", "t2"]),
        fetchedThreads: new Map([["t1", thread]]),
        stoppedCount: 5,
        runResult: { count: 10 },
      };

      const result = bulkRunReducer(state, { type: "RESET" });

      expect(result.status).toBe("idle");
      expect(result.processedThreadIds.size).toBe(0);
      expect(result.fetchedThreads.size).toBe(0);
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
