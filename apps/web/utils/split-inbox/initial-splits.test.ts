import { describe, expect, it } from "vitest";
import {
  ensureAllMailSplit,
  isDefaultAllMailSplit,
} from "@/utils/split-inbox/initial-splits";

describe("ensureAllMailSplit", () => {
  it("restores the unfiltered inbox when its tab was deleted", () => {
    const unread = {
      id: "unread",
      name: "Unread",
      order: 1,
      matchAll: true,
      bundleInInbox: false,
      hideFromAll: false,
      filters: [{ kind: "UNREAD" as const, value: null }],
    };
    expect(ensureAllMailSplit([unread])).toEqual([
      {
        id: "all",
        name: "All",
        order: -1,
        matchAll: true,
        bundleInInbox: false,
        hideFromAll: false,
        filters: [],
      },
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
        bundleInInbox: false,
        hideFromAll: false,
        filters: [],
      },
    ];
    expect(ensureAllMailSplit(splits)).toBe(splits);
  });

  it("keeps the inbox available with no saved splits", () => {
    expect(ensureAllMailSplit([])).toHaveLength(1);
  });
});

describe("isDefaultAllMailSplit", () => {
  it("recognizes the All tab created at signup by its name, not its id", () => {
    expect(isDefaultAllMailSplit({ name: "All", filters: [] })).toBe(true);
  });

  it("leaves a renamed All tab and filtered tabs alone", () => {
    expect(isDefaultAllMailSplit({ name: "Everything", filters: [] })).toBe(
      false,
    );
    expect(
      isDefaultAllMailSplit({
        name: "All",
        filters: [{ kind: "UNREAD" as const, value: null }],
      }),
    ).toBe(false);
  });
});
