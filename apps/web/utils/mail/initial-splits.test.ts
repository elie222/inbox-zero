import { describe, expect, it } from "vitest";
import { ensureAllMailSplit } from "@/utils/mail/initial-splits";

describe("ensureAllMailSplit", () => {
  it("restores the unfiltered inbox when its tab was deleted", () => {
    const unread = {
      id: "unread",
      name: "Unread",
      order: 1,
      matchAll: true,
      filters: [{ kind: "UNREAD" as const, value: null }],
    };
    expect(ensureAllMailSplit([unread])).toEqual([
      { id: "all", name: "All", order: -1, matchAll: true, filters: [] },
      unread,
    ]);
  });

  it("preserves an existing unfiltered tab and its position", () => {
    const splits = [
      {
        id: "existing",
        name: "Everything",
        order: 2,
        matchAll: true,
        filters: [],
      },
    ];
    expect(ensureAllMailSplit(splits)).toBe(splits);
  });

  it("keeps the inbox available with no saved splits", () => {
    expect(ensureAllMailSplit([])).toHaveLength(1);
  });
});
