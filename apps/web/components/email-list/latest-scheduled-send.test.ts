import { describe, expect, it } from "vitest";
import { getLatestScheduledSendId } from "./latest-scheduled-send";

describe("getLatestScheduledSendId", () => {
  it("changes the completed identity when an older-created reply sends later", () => {
    const rows = [
      { id: "newer", status: "SENT", sentAt: "2026-09-05T10:00:00Z" },
      { id: "older", status: "PENDING", sentAt: null },
    ];
    expect(getLatestScheduledSendId(rows)).toBe("newer");
    expect(
      getLatestScheduledSendId([
        rows[0],
        { id: "older", status: "SENT", sentAt: "2026-09-05T11:00:00Z" },
      ]),
    ).toBe("older");
  });

  it("does not identify an incomplete delivery as sent", () => {
    expect(
      getLatestScheduledSendId([
        { id: "queued", status: "PENDING", sentAt: null },
        { id: "processing", status: "PROCESSING", sentAt: null },
      ]),
    ).toBe("");
  });
});
