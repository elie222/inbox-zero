import { describe, expect, it } from "vitest";
import type { MailboxLabelCount } from "@/utils/mail-engine/label-count-targets";
import { splitLabelsByListVisibility } from "./label-visibility";

function counts(entries: Array<{ id: string; unread: number }>) {
  return new Map<string, MailboxLabelCount>(
    entries.map(({ id, unread }) => [
      id,
      { id, name: id, kind: "label", total: unread, unread },
    ]),
  );
}

describe("splitLabelsByListVisibility", () => {
  it("moves hidden labels out of the main list", () => {
    const { visibleLabels, hiddenLabels } = splitLabelsByListVisibility({
      labels: [
        { id: "receipts", name: "Receipts", labelListVisibility: "labelHide" },
        { id: "calendar", name: "Calendar", labelListVisibility: "labelShow" },
        { id: "travel", name: "Travel" },
      ],
      countsById: counts([]),
    });

    expect(visibleLabels.map((label) => label.id)).toEqual([
      "calendar",
      "travel",
    ]);
    expect(hiddenLabels.map((label) => label.id)).toEqual(["receipts"]);
  });

  it("hides a show-if-unread label once it has no unread mail", () => {
    const { visibleLabels, hiddenLabels } = splitLabelsByListVisibility({
      labels: [
        {
          id: "receipts",
          name: "Receipts",
          labelListVisibility: "labelShowIfUnread",
        },
        {
          id: "travel",
          name: "Travel",
          labelListVisibility: "labelShowIfUnread",
        },
      ],
      countsById: counts([
        { id: "receipts", unread: 0 },
        { id: "travel", unread: 3 },
      ]),
    });

    expect(visibleLabels.map((label) => label.id)).toEqual(["travel"]);
    expect(hiddenLabels.map((label) => label.id)).toEqual(["receipts"]);
  });

  it("keeps a show-if-unread label while its count is unknown", () => {
    const { visibleLabels } = splitLabelsByListVisibility({
      labels: [
        {
          id: "receipts",
          name: "Receipts",
          labelListVisibility: "labelShowIfUnread",
        },
      ],
      countsById: counts([]),
    });

    expect(visibleLabels.map((label) => label.id)).toEqual(["receipts"]);
  });
});
