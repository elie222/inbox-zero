import { describe, expect, it } from "vitest";
import type { ListThread } from "./types";
import { getListThreadSelection, getThreadSelectionKey } from "./types";

describe("thread selection identity", () => {
  it("keeps identical provider thread ids distinct across accounts", () => {
    const left = getListThreadSelection(
      createCombinedThread("account-1", "shared-thread"),
      "route-account",
    );
    const right = getListThreadSelection(
      createCombinedThread("account-2", "shared-thread"),
      "route-account",
    );

    expect(getThreadSelectionKey(left)).toBe("account-1:shared-thread");
    expect(getThreadSelectionKey(right)).toBe("account-2:shared-thread");
  });

  it("uses the route account for a single-account row", () => {
    expect(
      getListThreadSelection(createThread("thread-1"), "route-account"),
    ).toEqual({
      emailAccountId: "route-account",
      threadId: "thread-1",
    });
  });
});

function createThread(id: string): ListThread {
  return {
    id,
    messageIds: [],
    messages: [],
    plan: undefined,
    plans: [],
    snippet: id,
  };
}

function createCombinedThread(accountId: string, id: string): ListThread {
  return {
    ...createThread(id),
    account: {
      email: `${accountId}@example.com`,
      id: accountId,
      image: null,
      name: accountId,
    },
  };
}
