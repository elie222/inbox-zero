import { describe, expect, it } from "vitest";
import type { EmailFilter } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import { findSenderLabelFilters } from "./helpers";

describe("findSenderLabelFilters", () => {
  it("returns label-only filters for the sender", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "updates@example.com" },
        action: { addLabelIds: ["Label_123"] },
      },
      {
        id: "filter-2",
        criteria: { from: "other@example.com" },
        action: { addLabelIds: ["Label_456"] },
      },
    ];

    expect(
      findSenderLabelFilters(filters, "Updates <updates@example.com>"),
    ).toEqual([{ id: "filter-1", labelId: "Label_123" }]);
  });

  it("does not return auto-archive filters that also apply a label", () => {
    const filters: EmailFilter[] = [
      {
        id: "archive-filter",
        criteria: { from: "updates@example.com" },
        action: {
          removeLabelIds: [GmailLabel.INBOX],
          addLabelIds: ["Label_123"],
        },
      },
      {
        id: "label-filter",
        criteria: { from: "updates@example.com" },
        action: { addLabelIds: ["Label_456"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "updates@example.com")).toEqual([
      { id: "label-filter", labelId: "Label_456" },
    ]);
  });

  it("matches filters with a display-name sender criterion", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "Example Updates <updates@example.com>" },
        action: { addLabelIds: ["Label_123"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "updates@example.com")).toEqual([
      { id: "filter-1", labelId: "Label_123" },
    ]);
  });

  it("does not match filters with empty sender criteria", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "" },
        action: { addLabelIds: ["Label_123"] },
      },
      {
        id: "filter-2",
        criteria: {},
        action: { addLabelIds: ["Label_456"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "updates@example.com")).toEqual([]);
  });

  it("does not match every filter when the sender email is empty", () => {
    const filters: EmailFilter[] = [
      {
        id: "filter-1",
        criteria: { from: "updates@example.com" },
        action: { addLabelIds: ["Label_123"] },
      },
    ];

    expect(findSenderLabelFilters(filters, "")).toEqual([]);
  });
});
