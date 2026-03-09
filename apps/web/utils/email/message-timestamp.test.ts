import { describe, expect, it } from "vitest";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";

describe("getMessageTimestamp", () => {
  it("uses numeric internalDate when present", () => {
    const timestamp = getMessageTimestamp({
      internalDate: "1700000000000",
      date: "2024-01-01T00:00:00.000Z",
    });

    expect(timestamp).toBe(1_700_000_000_000);
  });

  it("parses ISO internalDate values", () => {
    const timestamp = getMessageTimestamp({
      internalDate: "2026-02-20T12:00:00.000Z",
      date: "2024-01-01T00:00:00.000Z",
    });

    expect(timestamp).toBe(new Date("2026-02-20T12:00:00.000Z").getTime());
  });

  it("falls back to date when internalDate is invalid", () => {
    const timestamp = getMessageTimestamp({
      internalDate: "not-a-date",
      date: "2024-01-01T00:00:00.000Z",
    });

    expect(timestamp).toBe(new Date("2024-01-01T00:00:00.000Z").getTime());
  });
});
