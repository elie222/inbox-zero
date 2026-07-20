/** @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWithAccount } from "@/utils/fetch";
import { runAiRules } from "@/utils/queue/email-actions";
import { toastError } from "@/components/Toast";
import { onRun } from "./bulk-run";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));
vi.mock("@/utils/queue/email-actions", () => ({ runAiRules: vi.fn() }));
vi.mock("@/utils/sleep", () => ({ sleep: vi.fn() }));
vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));

describe("onRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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

  it("cancels queued rule processing without reporting an error", async () => {
    vi.mocked(fetchWithAccount).mockResolvedValue({
      ok: true,
      json: async () => ({
        threads: [{ id: "thread-id", messages: [{ id: "message-id" }] }],
      }),
    } as Response);
    vi.mocked(runAiRules).mockImplementation(
      (_emailAccountId, _threads, _rerun, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );
    const onComplete = vi.fn();

    const abort = await onRun(
      "account-id",
      { startDate: new Date("2026-01-01T00:00:00.000Z") },
      vi.fn(),
      onComplete,
    );
    await vi.waitFor(() => expect(runAiRules).toHaveBeenCalled());
    abort();

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith("cancelled", 0);
    });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("continues fetching while another page is available", async () => {
    let page = 0;
    vi.mocked(fetchWithAccount).mockImplementation(async () => {
      page += 1;
      return {
        ok: true,
        json: async () => ({
          threads: [{ id: `thread-${page}`, messages: [{ id: "message-id" }] }],
          nextPageToken: page <= 100 ? `page-${page + 1}` : undefined,
        }),
      } as Response;
    });
    const onComplete = vi.fn();

    await onRun(
      "account-id",
      { startDate: new Date("2026-01-01T00:00:00.000Z") },
      vi.fn(),
      onComplete,
    );

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith("success", 101);
    });
    expect(fetchWithAccount).toHaveBeenCalledTimes(101);
    expect(runAiRules).toHaveBeenCalledTimes(101);
  });

  it("stops and reports an error when queued rule processing fails", async () => {
    vi.mocked(fetchWithAccount).mockResolvedValue({
      ok: true,
      json: async () => ({
        threads: [{ id: "thread-id", messages: [{ id: "message-id" }] }],
      }),
    } as Response);
    vi.mocked(runAiRules).mockRejectedValue(
      new Error("AI automation is unavailable."),
    );
    const onComplete = vi.fn();

    await onRun(
      "account-id",
      { startDate: new Date("2026-01-01T00:00:00.000Z") },
      vi.fn(),
      onComplete,
    );

    await vi.waitFor(() => {
      expect(onComplete).toHaveBeenCalledWith("error", 0);
    });
    expect(toastError).toHaveBeenCalledWith({
      title: "Failed to process emails",
      description: "AI automation is unavailable.",
    });
  });
});
