import { describe, expect, it, vi } from "vitest";
import { runCombinedThreadAction } from "./combined-thread-actions";

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
});

function createThread(accountId: string, threadId: string) {
  return {
    id: threadId,
    account: {
      id: accountId,
      email: `${accountId}@example.com`,
      name: null,
      image: null,
    },
  };
}
