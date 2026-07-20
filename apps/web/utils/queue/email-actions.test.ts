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
vi.mock("@/utils/queue/ai-queue", () => ({
  aiQueue: { addAll: vi.fn() },
}));

describe("runAiRules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects when rule processing returns a server error", async () => {
    vi.mocked(runRulesAction).mockResolvedValue({
      serverError: "AI automation is unavailable.",
    });
    await runAiRules(
      "account-id",
      [{ id: "thread-id", messages: [{ id: "message-id" }] } as never],
      false,
    );

    await expect(runQueuedTask()).rejects.toThrow(
      "AI automation is unavailable.",
    );

    expect(removeFromAiQueueAtom).toHaveBeenCalledWith("thread-id");
  });

  it("removes a thread without messages from the visible queue", async () => {
    await runAiRules(
      "account-id",
      [{ id: "thread-id", messages: [] } as never],
      false,
    );

    await runQueuedTask();

    expect(pushToAiQueueAtom).toHaveBeenCalledWith(["thread-id"]);
    expect(runRulesAction).not.toHaveBeenCalled();
    expect(removeFromAiQueueAtom).toHaveBeenCalledWith("thread-id");
  });

  it("removes a thread when rule processing fails", async () => {
    vi.mocked(runRulesAction).mockRejectedValue(new Error("Failed"));
    await runAiRules(
      "account-id",
      [{ id: "thread-id", messages: [{ id: "message-id" }] } as never],
      false,
    );

    await expect(runQueuedTask()).rejects.toThrow("Failed");

    expect(removeFromAiQueueAtom).toHaveBeenCalledWith("thread-id");
  });
});

async function runQueuedTask() {
  const tasks = vi.mocked(aiQueue.addAll).mock.calls[0][0];
  return tasks[0]();
}
