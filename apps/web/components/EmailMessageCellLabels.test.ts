import { describe, expect, it } from "vitest";
import {
  getEmailMessageCellLabels,
  getEmailThreadLabels,
} from "./EmailMessageCellLabels";

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

describe("getEmailThreadLabels", () => {
  it("keeps a thread label when the newest message is a draft without it", () => {
    const labels = getEmailThreadLabels({
      messages: [
        { labelIds: ["INBOX", "label-actioned"] },
        { labelIds: ["DRAFT"] },
      ],
      userLabels: {
        "label-actioned": {
          id: "label-actioned",
          name: "Actioned",
        },
      },
    });

    expect(labels).toEqual([{ id: "label-actioned", name: "Actioned" }]);
  });
});
