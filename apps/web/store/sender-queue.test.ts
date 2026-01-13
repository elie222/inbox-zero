import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock modules - these are hoisted, so use factory functions
vi.mock("@/store", () => {
  const { createStore } = require("jotai");
  return {
    jotaiStore: createStore(),
  };
});

vi.mock("@/utils/fetch", () => ({
  fetchWithAccount: vi.fn(),
}));

import { createSenderQueue } from "./sender-queue";
import { fetchWithAccount } from "@/utils/fetch";

const mockFetchWithAccount = vi.mocked(fetchWithAccount);

describe("createSenderQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("race condition handling", () => {
    it("handles concurrent onSuccess callbacks without losing updates", async () => {
      const onSuccessCallbacks: ((threadId: string) => void)[] = [];

      // Create a processThreads function that captures callbacks for manual triggering
      const processThreads = vi.fn(
        async ({
          threadIds,
          onSuccess,
        }: {
          threadIds: string[];
          onSuccess: (threadId: string) => void;
        }) => {
          // Store callbacks to trigger them concurrently later
          threadIds.forEach(() => {
            onSuccessCallbacks.push(onSuccess);
          });
        },
      );

      const { addToQueue } = createSenderQueue(processThreads);

      // Mock the fetch to return 3 threads
      mockFetchWithAccount.mockResolvedValue({
        ok: true,
        json: async () => ({
          threads: [{ id: "thread-1" }, { id: "thread-2" }, { id: "thread-3" }],
        }),
      } as Response);

      const completionCallback = vi.fn();

      // Start processing
      const processingPromise = addToQueue({
        sender: "test@example.com",
        emailAccountId: "account-1",
        onSuccess: completionCallback,
      });

      // Wait for the queue to be set up
      await vi.waitFor(() => {
        expect(onSuccessCallbacks).toHaveLength(3);
      });

      // Simulate concurrent onSuccess callbacks (race condition scenario)
      // Call all three callbacks "simultaneously" without awaiting
      onSuccessCallbacks[0]("thread-1");
      onSuccessCallbacks[1]("thread-2");
      onSuccessCallbacks[2]("thread-3");

      await processingPromise;

      // The completion callback should have been called exactly once
      // with the correct total (3 threads)
      expect(completionCallback).toHaveBeenCalledTimes(1);
      expect(completionCallback).toHaveBeenCalledWith(3);
    });
  });
});
