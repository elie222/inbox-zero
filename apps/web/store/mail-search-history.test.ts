// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addRecentSearch,
  matchRecentSearches,
} from "@/store/mail-search-history";

describe("addRecentSearch", () => {
  it("moves a repeated search to the front without duplicating it", () => {
    expect(addRecentSearch(["invoice", "Alice", "report"], "alice")).toEqual([
      "alice",
      "invoice",
      "report",
    ]);
  });

  it("caps the history at ten entries", () => {
    const recent = Array.from({ length: 10 }, (_, index) => `query ${index}`);
    const next = addRecentSearch(recent, "newest");
    expect(next).toHaveLength(10);
    expect(next[0]).toBe("newest");
    expect(next).not.toContain("query 9");
  });

  it("ignores blank searches", () => {
    expect(addRecentSearch(["invoice"], "   ")).toEqual(["invoice"]);
  });
});

describe("matchRecentSearches", () => {
  const recent = [
    "from:alice@example.com",
    "invoice",
    "Quarterly report",
    "has:attachment",
    "alice",
    "budget",
  ];

  it("offers the latest searches for an empty draft", () => {
    expect(matchRecentSearches(recent, "")).toEqual(recent.slice(0, 5));
  });

  it("matches the draft anywhere in the entry, case-insensitively", () => {
    expect(matchRecentSearches(recent, "ALI")).toEqual([
      "from:alice@example.com",
      "alice",
    ]);
  });

  it("hides an entry that already equals the draft", () => {
    expect(matchRecentSearches(recent, "invoice")).toEqual([]);
  });
});

describe("clearRecentSearchHistory", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
  });

  it("drops search-history keys and leaves unrelated storage", async () => {
    localStorage.setItem(
      "mail-search-history:account-1",
      JSON.stringify(["invoice"]),
    );
    localStorage.setItem("unrelated", "keep");
    const { clearRecentSearchHistory } = await import("./mail-search-history");
    clearRecentSearchHistory();
    expect(localStorage.getItem("unrelated")).toBe("keep");
    expect(localStorage.getItem("mail-search-history:account-1")).toBeNull();
  });

  it("does not persist a later remember after history is cleared", async () => {
    localStorage.setItem(
      "mail-search-history:account-1",
      JSON.stringify(["invoice"]),
    );
    const { clearRecentSearchHistory, rememberRecentSearch } = await import(
      "./mail-search-history"
    );
    clearRecentSearchHistory();
    rememberRecentSearch("account-1", "later");
    expect(localStorage.getItem("mail-search-history:account-1")).toBeNull();
  });

  it("drops one account's history and still persists later remembers", async () => {
    const { clearRecentSearchHistoryForAccount, rememberRecentSearch } =
      await import("./mail-search-history");
    rememberRecentSearch("account-1", "invoice");
    rememberRecentSearch("account-2", "receipt");
    clearRecentSearchHistoryForAccount("account-1");
    rememberRecentSearch("account-2", "budget");

    expect(localStorage.getItem("mail-search-history:account-1")).toBeNull();
    expect(localStorage.getItem("mail-search-history:account-2")).toBe(
      JSON.stringify(["budget", "receipt"]),
    );
  });
});
