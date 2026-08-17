// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  accountIdFromSnapshotKey,
  clearPersistedSwrCache,
  clearPersistedSwrCacheForAccount,
  persistSwrEntries,
  readPersistedSwrEntries,
  resetSwrPersistenceBlocksForTesting,
} from "./swr-persistence";

const ACCOUNT_A = "account-a";
const ACCOUNT_B = "account-b";

function cacheWith(entries: Record<string, unknown>) {
  return new Map(Object.entries(entries).map(([key, data]) => [key, { data }]));
}

describe("swr-persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetSwrPersistenceBlocksForTesting();
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

  it("keeps previously persisted keys when the cache only has a subset", () => {
    persistSwrEntries(
      ACCOUNT_A,
      cacheWith({
        "/api/labels": { labels: ["old"] },
        "/api/labels/counts": { counts: [7] },
      }),
    );

    // A page that only fetched labels persists; counts must survive.
    persistSwrEntries(
      ACCOUNT_A,
      cacheWith({ "/api/labels": { labels: ["new"] } }),
    );

    const restored = readPersistedSwrEntries(ACCOUNT_A);
    expect(restored.get("/api/labels")?.data).toEqual({ labels: ["new"] });
    expect(restored.get("/api/labels/counts")?.data).toEqual({ counts: [7] });
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

  it("blocks persisting after logout so pagehide can't resurrect data", () => {
    persistSwrEntries(ACCOUNT_A, cacheWith({ "/api/labels": { labels: [] } }));

    clearPersistedSwrCache();
    // The logout redirect fires pagehide, which persists from the warm cache.
    persistSwrEntries(ACCOUNT_A, cacheWith({ "/api/labels": { labels: [] } }));

    expect(readPersistedSwrEntries(ACCOUNT_A).size).toBe(0);
    expect(window.localStorage.length).toBe(0);
  });

  it("blocks persisting only for a cleared account", () => {
    clearPersistedSwrCacheForAccount(ACCOUNT_A);

    persistSwrEntries(ACCOUNT_A, cacheWith({ "/api/labels": { labels: [] } }));
    persistSwrEntries(ACCOUNT_B, cacheWith({ "/api/labels": { labels: [] } }));

    expect(readPersistedSwrEntries(ACCOUNT_A).size).toBe(0);
    expect(readPersistedSwrEntries(ACCOUNT_B).size).toBe(1);
  });

  it("maps snapshot storage keys back to account ids", () => {
    expect(accountIdFromSnapshotKey(`inbox-zero:swr:v1:${ACCOUNT_A}`)).toBe(
      ACCOUNT_A,
    );
    expect(accountIdFromSnapshotKey("inbox-zero:swr:v1:")).toBeNull();
    expect(accountIdFromSnapshotKey("unrelated-key")).toBeNull();
  });
});
