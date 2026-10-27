import { describe, expect, it } from "vitest";
import { mailPredicateSchema } from "@inboxzero/mail-core/queries";
import {
  readSplitSelection,
  selectedSplitIds,
  splitSelectionPredicate,
  toggleSplitSelection,
} from "./split-selection";
import type { MailSplit } from "./split-query";

const splits: MailSplit[] = [
  { id: "all", name: "All", matchAll: true, filters: [] },
  {
    id: "marketing",
    name: "Marketing",
    matchAll: true,
    filters: [{ kind: "LABEL", value: "label-marketing" }],
  },
  {
    id: "notification",
    name: "Notification",
    matchAll: true,
    filters: [{ kind: "LABEL", value: "label-notification" }],
  },
];

describe("split selection", () => {
  it("selects all tag types by default, and clears/restores them with All", () => {
    expect(
      [...selectedSplitIds(readSplitSelection(null, splits), splits)].sort(),
    ).toEqual(["all", "marketing", "notification"]);
    expect(toggleSplitSelection("all", "all", splits)).toBe("none");
    expect([
      ...selectedSplitIds(readSplitSelection("none", splits), splits),
    ]).toEqual([]);
    expect(toggleSplitSelection("none", "all", splits)).toBe("all");
    expect(
      splitSelectionPredicate(readSplitSelection("none", splits), splits),
    ).toMatchObject({
      predicates: [
        { kind: "role", role: "inbox" },
        { kind: "any", predicates: [] },
      ],
    });
  });

  it("unchecks a tag and All, excludes that tag, and restores All when reselected", () => {
    const value = toggleSplitSelection("all", "marketing", splits);
    const selection = readSplitSelection(value, splits);
    expect(selection).toEqual({ mode: "exclude", ids: ["marketing"] });
    expect([...selectedSplitIds(selection, splits)]).toEqual(["notification"]);
    expect(splitSelectionPredicate(selection, splits)).toMatchObject({
      predicates: [
        { kind: "role", role: "inbox" },
        {
          kind: "not",
          predicate: { kind: "any", predicates: [expect.any(Object)] },
        },
      ],
    });
    expect(toggleSplitSelection(value, "marketing", splits)).toBe("all");
    expect(toggleSplitSelection(value, "notification", splits)).toBe("none");
  });

  it("focuses one tag, then allows other tags to be toggled independently", () => {
    const focused = readSplitSelection("marketing", splits);
    expect([...selectedSplitIds(focused, splits)]).toEqual(["marketing"]);
    expect(toggleSplitSelection("marketing", "marketing", splits)).toBe("none");
    expect(toggleSplitSelection("none", "notification", splits)).toBe(
      "notification",
    );
    expect(toggleSplitSelection("marketing", "notification", splits)).toBe(
      "all",
    );
  });

  it("keeps multi-selection stable across refresh/reordering and ignores deleted tags", () => {
    const state = JSON.stringify({
      mode: "include",
      ids: ["notification", "marketing", "deleted"],
    });
    expect(readSplitSelection(state, [...splits].reverse())).toEqual({
      mode: "include",
      ids: ["notification", "marketing"],
    });
    expect(readSplitSelection("not-json-or-an-existing-tag", splits)).toEqual({
      mode: "exclude",
      ids: [],
    });
  });

  it("uses account-scoped predicates supplied by the combined inbox without widening the filter", () => {
    const predicate = splitSelectionPredicate(
      readSplitSelection("marketing", splits),
      splits,
      () => ({
        kind: "membership",
        membership: "label",
        id: "different-id",
        accountId: "other-account",
      }),
    );
    expect(mailPredicateSchema.safeParse(predicate).success).toBe(true);
    expect(predicate).toMatchObject({
      predicates: [
        expect.any(Object),
        {
          kind: "any",
          predicates: [{ id: "different-id", accountId: "other-account" }],
        },
      ],
    });
  });
});
