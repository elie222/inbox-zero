import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRun } from "./bulk-run";
import { fetchWithAccount } from "@/utils/fetch";
import { runAiRules } from "@/utils/queue/email-actions";

vi.mock("@/utils/fetch", () => ({ fetchWithAccount: vi.fn() }));
vi.mock("@/utils/queue/email-actions", () => ({ runAiRules: vi.fn() }));
vi.mock("@/components/Toast", () => ({ toastError: vi.fn() }));
vi.mock("@/utils/error", () => ({ captureException: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchWithAccount).mockResolvedValue(Response.json({ threads: [] }));
});

describe("bulk processing", () => {
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
    expect(runAiRules).toHaveBeenCalledWith(
      "account-id",
      [thread],
      false,
      expect.any(AbortSignal),
    );
  });
});
