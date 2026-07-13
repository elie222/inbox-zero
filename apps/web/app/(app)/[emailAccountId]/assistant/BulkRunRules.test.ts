/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAccount } from "@/utils/fetch";
import { runAiRules } from "@/utils/queue/email-actions";
import { onRun } from "./bulk-run";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));
vi.mock("@/utils/queue/email-actions", () => ({ runAiRules: vi.fn() }));
vi.mock("@/utils/sleep", () => ({ sleep: vi.fn() }));

describe("onRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not queue a fetched batch after cancellation", async () => {
    vi.mocked(fetchWithAccount).mockImplementation(
      ({ init }) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const onThreadsQueued = vi.fn();
    const onComplete = vi.fn();

    const abort = await onRun(
      "account-id",
      { startDate: new Date("2026-01-01T00:00:00.000Z") },
      onThreadsQueued,
      onComplete,
    );
    abort();

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith("cancelled", 0);
    });
    expect(onThreadsQueued).not.toHaveBeenCalled();
    expect(runAiRules).not.toHaveBeenCalled();
  });
});
