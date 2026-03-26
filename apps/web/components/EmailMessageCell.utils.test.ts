import { describe, expect, test } from "vitest";
import {
  normalizeDisplayedLabels,
  type DisplayLabel,
} from "./EmailMessageCell.utils";

const toReplyLabel: DisplayLabel = { id: "to-reply", name: "To Reply" };
const awaitingReplyLabel: DisplayLabel = {
  id: "awaiting-reply",
  name: "Awaiting Reply",
};
const fyiLabel: DisplayLabel = { id: "fyi", name: "FYI" };
const actionedLabel: DisplayLabel = { id: "actioned", name: "Actioned" };
const archivedLabel: DisplayLabel = { id: "archived", name: "Archived" };

describe("normalizeDisplayedLabels", () => {
  test("keeps only the highest-priority conversation status label", () => {
    expect(
      normalizeDisplayedLabels([archivedLabel, actionedLabel, fyiLabel]),
    ).toEqual([archivedLabel, fyiLabel]);
  });

  test("prefers to reply over every other conversation status", () => {
    expect(
      normalizeDisplayedLabels([
        actionedLabel,
        fyiLabel,
        toReplyLabel,
        awaitingReplyLabel,
      ]),
    ).toEqual([toReplyLabel]);
  });

  test("leaves non-status labels untouched", () => {
    expect(normalizeDisplayedLabels([archivedLabel])).toEqual([archivedLabel]);
  });
});
