import { describe, expect, it } from "vitest";
import {
  addRecentSearch,
  matchRecentSearches,
} from "@/app/(app)/[emailAccountId]/mail/mail-search-history";

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
