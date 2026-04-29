import { describe, expect, it } from "vitest";
import { getEmailMessageCellLabels } from "./EmailMessageCellLabels";

describe("getEmailMessageCellLabels", () => {
  it("does not infer Outlook sent mail as archived just because it is outside the inbox", () => {
    const labels = getEmailMessageCellLabels({
      labelIds: ["SENT", "Awaiting Reply"],
      userLabels: {
        awaitingReply: {
          id: "awaitingReply",
          name: "Awaiting Reply",
        },
      },
      provider: "microsoft",
    });

    expect(labels).toEqual([{ id: "awaitingReply", name: "Awaiting Reply" }]);
  });

  it("shows archived for Outlook messages in the archive folder", () => {
    const labels = getEmailMessageCellLabels({
      labelIds: ["ARCHIVE", "label-newsletter"],
      userLabels: {
        "label-newsletter": {
          id: "label-newsletter",
          name: "Newsletter",
        },
      },
      provider: "microsoft",
    });

    expect(labels).toEqual([
      { id: "ARCHIVE", name: "Archived" },
      { id: "label-newsletter", name: "Newsletter" },
    ]);
  });

  it("keeps Gmail archive inference for messages without the inbox label", () => {
    const labels = getEmailMessageCellLabels({
      labelIds: ["label-newsletter"],
      userLabels: {
        "label-newsletter": {
          id: "label-newsletter",
          name: "Newsletter",
        },
      },
      provider: "google",
    });

    expect(labels).toEqual([
      { id: "ARCHIVE", name: "Archived" },
      { id: "label-newsletter", name: "Newsletter" },
    ]);
  });
});
