// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPersistedSwrCache,
  clearPersistedSwrCacheForAccount,
  persistSwrEntries,
  readPersistedSwrEntries,
} from "./swr-persistence";

const ACCOUNT_A = "account-a";
const ACCOUNT_B = "account-b";

function cacheWith(entries: Record<string, unknown>) {
  return new Map(Object.entries(entries).map(([key, data]) => [key, { data }]));
}

describe("swr-persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("round-trips whitelisted entries per account", () => {
    persistSwrEntries(
      ACCOUNT_A,
      cacheWith({
        "/api/labels": { labels: [{ id: "l1", name: "Newsletters" }] },
        "/api/labels/counts": { counts: [{ id: "l1", unread: 3 }] },
      }),
    );

    const restored = readPersistedSwrEntries(ACCOUNT_A);
    expect(restored.get("/api/labels")).toEqual({
      data: { labels: [{ id: "l1", name: "Newsletters" }] },
      isLoading: false,
      isValidating: false,
    });
    expect(restored.get("/api/labels/counts")?.data).toEqual({
      counts: [{ id: "l1", unread: 3 }],
    });
  });

  it("does not leak entries across accounts", () => {
    persistSwrEntries(ACCOUNT_A, cacheWith({ "/api/labels": { labels: [] } }));

    expect(readPersistedSwrEntries(ACCOUNT_B).size).toBe(0);
  });

  it("ignores non-whitelisted cache keys", () => {
    persistSwrEntries(
      ACCOUNT_A,
      cacheWith({
        "/api/labels": { labels: [] },
        "/api/threads?limit=20": { threads: ["should not persist"] },
      }),
    );

    const stored = window.localStorage.getItem(
      `inbox-zero:swr:v1:${ACCOUNT_A}`,
    );
    expect(stored).not.toContain("should not persist");
    expect(
      readPersistedSwrEntries(ACCOUNT_A).has("/api/threads?limit=20"),
    ).toBe(false);
  });

  it("returns nothing for a corrupt snapshot instead of throwing", () => {
    window.localStorage.setItem(`inbox-zero:swr:v1:${ACCOUNT_A}`, "{not json");

    expect(readPersistedSwrEntries(ACCOUNT_A).size).toBe(0);
  });

  it("skips persisting when there is no whitelisted data", () => {
    persistSwrEntries(ACCOUNT_A, cacheWith({ "/api/other": { x: 1 } }));

    expect(window.localStorage.length).toBe(0);
  });

  it("clears one account without touching others", () => {
    persistSwrEntries(ACCOUNT_A, cacheWith({ "/api/labels": { labels: [] } }));
    persistSwrEntries(ACCOUNT_B, cacheWith({ "/api/labels": { labels: [] } }));

    clearPersistedSwrCacheForAccount(ACCOUNT_A);

    expect(readPersistedSwrEntries(ACCOUNT_A).size).toBe(0);
    expect(readPersistedSwrEntries(ACCOUNT_B).size).toBe(1);
  });

  it("clears every account on logout but leaves unrelated storage", () => {
    persistSwrEntries(ACCOUNT_A, cacheWith({ "/api/labels": { labels: [] } }));
    persistSwrEntries(ACCOUNT_B, cacheWith({ "/api/labels": { labels: [] } }));
    window.localStorage.setItem("unrelated", "keep-me");

    clearPersistedSwrCache();

    expect(readPersistedSwrEntries(ACCOUNT_A).size).toBe(0);
    expect(readPersistedSwrEntries(ACCOUNT_B).size).toBe(0);
    expect(window.localStorage.getItem("unrelated")).toBe("keep-me");
  });
});
