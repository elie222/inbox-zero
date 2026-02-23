import { describe, expect, it } from "vitest";
import { getLatestNonDraftMessage } from "./latest-message";

type TestMessage = {
  id: string;
  isDraft: boolean;
  timestamp: number;
};

describe("getLatestNonDraftMessage", () => {
  it("returns the most recent non-draft message", () => {
    const message = getLatestNonDraftMessage({
      messages: [
        { id: "older", isDraft: false, timestamp: 1000 },
        { id: "draft-newest", isDraft: true, timestamp: 3000 },
        { id: "newest", isDraft: false, timestamp: 2000 },
      ],
      isDraft: (msg) => msg.isDraft,
      getTimestamp: (msg) => msg.timestamp,
    });

    expect(message?.id).toBe("newest");
  });

  it("returns null when all messages are drafts", () => {
    const message = getLatestNonDraftMessage({
      messages: [
        { id: "draft-1", isDraft: true, timestamp: 1000 },
        { id: "draft-2", isDraft: true, timestamp: 2000 },
      ],
      isDraft: (msg) => msg.isDraft,
      getTimestamp: (msg) => msg.timestamp,
    });

    expect(message).toBeNull();
  });

  it("returns null when there are no messages", () => {
    const message = getLatestNonDraftMessage({
      messages: [] as TestMessage[],
      isDraft: (msg) => msg.isDraft,
      getTimestamp: (msg) => msg.timestamp,
    });

    expect(message).toBeNull();
  });
});
