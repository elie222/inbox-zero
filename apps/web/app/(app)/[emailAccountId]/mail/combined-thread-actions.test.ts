import { describe, expect, it, vi } from "vitest";
import {
  runCombinedBulkArchiveAction,
  runCombinedThreadAction,
} from "./combined-thread-actions";

describe("runCombinedThreadAction", () => {
  it("routes same-id threads through their owning accounts", async () => {
    const action = vi.fn().mockResolvedValue({ data: undefined });

    const result = await runCombinedThreadAction({
      threads: [
        createThread("account-1", "shared"),
        createThread("account-2", "shared"),
      ],
      action,
    });

    expect(action.mock.calls).toEqual([
      ["account-1", "shared"],
      ["account-2", "shared"],
    ]);
    expect(result).toEqual({
      failedThreadKeys: [],
      succeededThreadKeys: ["account-1:shared", "account-2:shared"],
    });
  });

  it("reports thrown and rejected action results by composite thread key", async () => {
    const action = vi
      .fn()
      .mockRejectedValueOnce(new Error("provider failed"))
      .mockResolvedValueOnce({ serverError: "action failed" })
      .mockResolvedValueOnce({ validationErrors: { threadId: ["invalid"] } });

    const result = await runCombinedThreadAction({
      threads: [
        createThread("account-1", "one"),
        createThread("account-2", "two"),
        createThread("account-3", "three"),
      ],
      action,
    });

    expect(result).toEqual({
      failedThreadKeys: ["account-1:one", "account-2:two", "account-3:three"],
      succeededThreadKeys: [],
    });
  });

  it("archives each account with one bulk action and preserves partial results", async () => {
    const threads = [
      createThread("account-1", "one"),
      createThread("account-1", "two"),
      createThread("account-2", "three"),
    ];
    const action = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          succeededThreadIds: ["one"],
          failedThreadIds: ["two"],
        },
      })
      .mockResolvedValueOnce({
        data: {
          succeededThreadIds: ["three"],
          failedThreadIds: [],
        },
      });

    const result = await runCombinedBulkArchiveAction({ threads, action });

    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls).toEqual([
      [
        "account-1",
        {
          threads: [
            { threadId: "one", messageIds: ["one-message"] },
            { threadId: "two", messageIds: ["two-message"] },
          ],
        },
      ],
      [
        "account-2",
        {
          threads: [{ threadId: "three", messageIds: ["three-message"] }],
        },
      ],
    ]);
    expect(result).toEqual({
      failedThreadKeys: ["account-1:two"],
      succeededThreadKeys: ["account-1:one", "account-2:three"],
    });
  });

  it("splits account groups above the server action limit", async () => {
    const threads = Array.from({ length: 501 }, (_, index) =>
      createThread("account-1", `thread-${index}`),
    );
    const action = vi.fn(
      async (
        _accountId: string,
        input: { threads: Array<{ threadId: string }> },
      ) => ({
        data: {
          failedThreadIds: [],
          succeededThreadIds: input.threads.map((thread) => thread.threadId),
        },
      }),
    );

    const result = await runCombinedBulkArchiveAction({ threads, action });

    expect(action).toHaveBeenCalledTimes(2);
    expect(action.mock.calls.map((call) => call[1].threads.length)).toEqual([
      500, 1,
    ]);
    expect(result.failedThreadKeys).toEqual([]);
    expect(result.succeededThreadKeys).toHaveLength(501);
  });
});

function createThread(accountId: string, threadId: string) {
  return {
    id: threadId,
    messageIds: [`${threadId}-message`],
    account: {
      id: accountId,
      email: `${accountId}@example.com`,
      name: null,
      image: null,
    },
  };
}
