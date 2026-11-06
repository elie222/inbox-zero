import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRun } from "./bulk-run";
import { fetchWithAccount } from "@/utils/fetch";
import { runAiRules } from "@/utils/queue/email-actions";
import { toastError } from "@/components/Toast";
import { EMAIL_PROVIDER_RATE_LIMIT_MESSAGE } from "@/utils/error";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));
vi.mock("@/utils/queue/email-actions", () => ({ runAiRules: vi.fn() }));
vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));
vi.mock("@/utils/error", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/utils/error")>()),
  captureException: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWithAccount).mockResolvedValue(Response.json({ threads: [] }));
});

describe("bulk processing", () => {
  it.each([
    undefined,
    false,
    true,
  ])("preserves the draft choice across pages and reruns (%s)", async (generateDraftReplies) => {
    const thread = {
      id: "thread-id",
      messages: [{ id: "message-id" }],
      plan: {},
    };
    vi.mocked(fetchWithAccount)
      .mockResolvedValueOnce(
        Response.json({ threads: [thread], nextPageToken: "next-page" }),
      )
      .mockResolvedValueOnce(Response.json({ threads: [thread] }));
    const complete = vi.fn();
    await onRun(
      "account-id",
      { startDate: new Date(2025, 3, 1), rerun: true, generateDraftReplies },
      vi.fn(),
      complete,
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith("success", 2));
    expect(runAiRules).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(runAiRules).mock.calls) {
      expect(call).toEqual([
        "account-id",
        [thread],
        true,
        {
          signal: expect.any(AbortSignal),
          skipDraftReplies: !generateDraftReplies,
          runWithRetry: expect.any(Function),
        },
      ]);
    }
  });

  it("includes the entire selected end date, including a same-day range", async () => {
    const date = new Date(2025, 3, 10);
    const complete = vi.fn();

    await onRun(
      "account-id",
      { startDate: date, endDate: date },
      vi.fn(),
      complete,
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith("success", 0));

    const request = vi.mocked(fetchWithAccount).mock.calls.at(0)?.at(0);
    expect(request).toBeDefined();
    if (!request) throw new Error("Expected a thread request");
    const query = new URL(request.url, "https://example.com").searchParams;
    const after = query.get("after");
    const before = query.get("before");
    expect(after).toBeTruthy();
    expect(before).toBeTruthy();
    if (!after || !before) throw new Error("Expected both date bounds");
    expect(new Date(after)).toEqual(date);
    expect(new Date(before)).toEqual(new Date(2025, 3, 11));
    expect(date).toEqual(new Date(2025, 3, 10));
  });

  it.each([
    true,
    false,
  ])("preserves the read-email filter across pages (includeRead: %s)", async (includeRead) => {
    const thread = { id: "thread-id", messages: [{ id: "message-id" }] };
    vi.mocked(fetchWithAccount)
      .mockResolvedValueOnce(
        Response.json({ threads: [thread], nextPageToken: "next-page" }),
      )
      .mockResolvedValueOnce(Response.json({ threads: [] }));
    const complete = vi.fn();

    await onRun(
      "account-id",
      { startDate: new Date(2025, 3, 1), includeRead },
      vi.fn(),
      complete,
    );
    await vi.waitFor(() => expect(complete).toHaveBeenCalledWith("success", 1));

    const queries = vi
      .mocked(fetchWithAccount)
      .mock.calls.map(
        ([request]) => new URL(request.url, "https://example.com").searchParams,
      );
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.get("isUnread")).toBe(includeRead ? null : "true");
      expect(query.get("before")).toBeNull();
    }
    expect(queries.at(1)?.get("nextPageToken")).toBe("next-page");
    expect(runAiRules).toHaveBeenCalledWith("account-id", [thread], false, {
      signal: expect.any(AbortSignal),
      skipDraftReplies: true,
      runWithRetry: expect.any(Function),
    });
  });
});

describe("bulk processing under provider rate limits", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits out a rate-limited page fetch and resumes from the same page", async () => {
    vi.useFakeTimers();
    const firstPage = [thread("thread-1"), thread("thread-2")];
    const secondPage = [thread("thread-3")];
    vi.mocked(fetchWithAccount)
      .mockResolvedValueOnce(
        Response.json({ threads: firstPage, nextPageToken: "page-2" }),
      )
      .mockResolvedValueOnce(rateLimitResponse({ retryAfterSeconds: 30 }))
      .mockResolvedValueOnce(Response.json({ threads: secondPage }));
    const onThreadsQueued = vi.fn();
    const onComplete = vi.fn();
    const onWaiting = vi.fn();

    await onRun(
      "account-id",
      { startDate: new Date(2025, 3, 1) },
      onThreadsQueued,
      onComplete,
      onWaiting,
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(onWaiting).toHaveBeenLastCalledWith(expect.any(Date));
    expect(onComplete).not.toHaveBeenCalled();
    expect(toastError).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(30_000);

    expect(onComplete).toHaveBeenCalledWith("success", 3);
    expect(onWaiting).toHaveBeenLastCalledWith(null);
    const queries = vi
      .mocked(fetchWithAccount)
      .mock.calls.map(
        ([request]) => new URL(request.url, "https://example.com").searchParams,
      );
    expect(queries.map((query) => query.get("nextPageToken"))).toEqual([
      null,
      "page-2",
      "page-2",
    ]);
    const queuedIds = onThreadsQueued.mock.calls.flatMap(([threads]) =>
      threads.map((queued: { id: string }) => queued.id),
    );
    expect(queuedIds).toEqual(["thread-1", "thread-2", "thread-3"]);
  });

  it("stops with the processed count when the provider never recovers", async () => {
    vi.useFakeTimers();
    vi.mocked(fetchWithAccount)
      .mockResolvedValueOnce(
        Response.json({
          threads: [thread("thread-1"), thread("thread-2")],
          nextPageToken: "page-2",
        }),
      )
      .mockResolvedValue(rateLimitResponse({ retryAfterSeconds: 120 }));
    const onComplete = vi.fn();

    await onRun(
      "account-id",
      { startDate: new Date(2025, 3, 1) },
      vi.fn(),
      onComplete,
      vi.fn(),
    );
    await vi.advanceTimersByTimeAsync(60 * 60_000);

    expect(onComplete).toHaveBeenCalledWith("error", 2);
    expect(toastError).toHaveBeenCalledWith({
      title: "Processing stopped",
      description: expect.stringContaining("2 emails"),
    });
  });

  it("still stops on a request error that retrying will not fix", async () => {
    vi.mocked(fetchWithAccount).mockResolvedValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }),
    );
    const onComplete = vi.fn();

    await onRun(
      "account-id",
      { startDate: new Date(2025, 3, 1) },
      vi.fn(),
      onComplete,
    );

    await vi.waitFor(() => expect(onComplete).toHaveBeenCalledWith("error", 0));
    expect(fetchWithAccount).toHaveBeenCalledTimes(1);
    expect(toastError).toHaveBeenCalledWith({
      title: "Failed to fetch emails",
      description: "Unauthorized",
    });
  });
});

function thread(id: string) {
  return { id, messages: [{ id: `${id}-message` }] };
}

function rateLimitResponse({
  retryAfterSeconds,
}: {
  retryAfterSeconds: number;
}) {
  return Response.json(
    { error: EMAIL_PROVIDER_RATE_LIMIT_MESSAGE },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}
