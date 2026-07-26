import { beforeEach, describe, expect, it, vi } from "vitest";
import { runAiRules } from "./email-actions";
import { runRulesAction } from "@/utils/actions/ai-rule";
import { pushToAiQueueAtom, removeFromAiQueueAtom } from "@/store/ai-queue";
import { aiQueue } from "@/utils/queue/ai-queue";

vi.mock("@/utils/actions/ai-rule", () => ({ runRulesAction: vi.fn() }));
vi.mock("@/store/ai-queue", () => ({
  pushToAiQueueAtom: vi.fn(),
  removeFromAiQueueAtom: vi.fn(),
}));

describe("runAiRules", () => {
  beforeEach(async () => {
    await aiQueue.onIdle();
    aiQueue.concurrency = 3;
    aiQueue.start();
    vi.clearAllMocks();
  });

  it("rejects when rule processing returns a server error", async () => {
    vi.mocked(runRulesAction).mockResolvedValue({
      serverError: "AI automation is unavailable.",
    });
    await expect(
      runAiRules(
        "account-id",
        [{ id: "thread-id", messages: [{ id: "message-id" }] } as never],
        false,
      ),
    ).rejects.toThrow("AI automation is unavailable.");

    expect(removeFromAiQueueAtom).toHaveBeenCalledWith("thread-id");
  });

  it("removes a thread without messages from the visible queue", async () => {
    await runAiRules(
      "account-id",
      [{ id: "thread-id", messages: [] } as never],
      false,
    );

    expect(pushToAiQueueAtom).toHaveBeenCalledWith(["thread-id"]);
    expect(runRulesAction).not.toHaveBeenCalled();
    expect(removeFromAiQueueAtom).toHaveBeenCalledWith("thread-id");
  });

  it("removes a thread when rule processing fails", async () => {
    vi.mocked(runRulesAction).mockRejectedValue(new Error("Failed"));
    await expect(
      runAiRules(
        "account-id",
        [{ id: "thread-id", messages: [{ id: "message-id" }] } as never],
        false,
      ),
    ).rejects.toThrow("Failed");

    expect(removeFromAiQueueAtom).toHaveBeenCalledWith("thread-id");
  });

  it("waits for active actions and cancels queued actions after a failure", async () => {
    aiQueue.concurrency = 2;
    const activeAction =
      createDeferred<Awaited<ReturnType<typeof runRulesAction>>>();
    vi.mocked(runRulesAction)
      .mockRejectedValueOnce(new Error("Failed"))
      .mockReturnValueOnce(activeAction.promise)
      .mockResolvedValueOnce({ data: [] });

    const runPromise = runAiRules(
      "account-id",
      createThreads("thread-1", "thread-2", "thread-3"),
      false,
    );
    let settled = false;
    const settlementPromise = runPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.waitFor(() => expect(runRulesAction).toHaveBeenCalledTimes(2));
    expect(settled).toBe(false);

    activeAction.resolve({ data: [] });

    await expect(runPromise).rejects.toThrow("Failed");
    await settlementPromise;
    expect(runRulesAction).toHaveBeenCalledTimes(2);
    expect(removeFromAiQueueAtom).toHaveBeenCalledTimes(3);
  });

  it("waits for active actions after cancellation", async () => {
    aiQueue.concurrency = 1;
    const activeAction =
      createDeferred<Awaited<ReturnType<typeof runRulesAction>>>();
    vi.mocked(runRulesAction)
      .mockReturnValueOnce(activeAction.promise)
      .mockResolvedValueOnce({ data: [] });
    const abortController = new AbortController();

    const runPromise = runAiRules(
      "account-id",
      createThreads("thread-1", "thread-2"),
      false,
      abortController.signal,
    );
    let settled = false;
    const settlementPromise = runPromise.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );

    await vi.waitFor(() => expect(runRulesAction).toHaveBeenCalledTimes(1));
    abortController.abort();
    await Promise.resolve();
    expect(settled).toBe(false);

    activeAction.resolve({ data: [] });

    await expect(runPromise).rejects.toMatchObject({ name: "AbortError" });
    await settlementPromise;
    expect(runRulesAction).toHaveBeenCalledTimes(1);
    expect(removeFromAiQueueAtom).toHaveBeenCalledTimes(2);
  });
});

function createThreads(...threadIds: string[]) {
  return threadIds.map(
    (threadId) =>
      ({ id: threadId, messages: [{ id: `${threadId}-message` }] }) as never,
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
