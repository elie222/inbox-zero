import { describe, expect, it } from "vitest";
import { mergePartialSearchResults } from "./local-search-results";
import type { ListThread } from "./types";

describe("partial provider search", () => {
  it("adds cached results only for failed accounts and deduplicates by account and thread", () => {
    const remote = [
      thread("account-a", "same"),
      thread("account-b", "existing"),
    ];
    const local = [
      thread("account-a", "stale"),
      thread("account-b", "same"),
      thread("account-b", "existing"),
    ];
    expect(mergePartialSearchResults(remote, local, ["account-b"])).toEqual([
      ...remote,
      local[1],
    ]);
  });
  it("keeps a successful empty provider response authoritative", () => {
    const remote: ListThread[] = [];
    expect(
      mergePartialSearchResults(remote, [thread("account-a", "stale")], []),
    ).toBe(remote);
  });
});

function thread(accountId: string, id: string): ListThread {
  return {
    id,
    account: {
      id: accountId,
      email: "user@example.com",
      name: null,
      image: null,
    },
    messages: [],
    messageIds: [],
    snippet: "",
    plans: [],
    plan: undefined,
    participantMessages: undefined,
  };
}
