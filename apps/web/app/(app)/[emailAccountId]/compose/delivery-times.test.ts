import { describe, expect, it } from "vitest";
import {
  getReminderAfterSendTimeChange,
  parseDeliveryTimes,
} from "./delivery-times";

describe("changing a scheduled send time", () => {
  it.each([
    "2026-09-07T10:00:00Z",
    "2026-09-08T10:00:00Z",
  ])("clears a reminder when the new send time %s reaches or passes it", (sendAt) => {
    expect(getReminderAfterSendTimeChange(sendAt, "2026-09-07T10:00:00Z")).toBe(
      "",
    );
  });

  it("keeps a reminder after the new send time", () => {
    expect(
      getReminderAfterSendTimeChange(
        "2026-09-06T10:00:00Z",
        "2026-09-07T10:00:00Z",
      ),
    ).toBe("2026-09-07T10:00:00Z");
  });

  it("keeps the reminder when switching back to send now", () => {
    expect(getReminderAfterSendTimeChange("", "2026-09-07T10:00:00Z")).toBe(
      "2026-09-07T10:00:00Z",
    );
  });
});

describe("persisted delivery times", () => {
  it.each([
    "not-a-date",
    "2026-99-99T10:00:00Z",
    " ",
  ])("rejects invalid send time %s instead of converting it to send now", (sendAt) => {
    expect(parseDeliveryTimes(sendAt, "")).toMatchObject({ valid: false });
  });

  it("rejects an invalid reminder without throwing or removing the schedule", () => {
    expect(parseDeliveryTimes("2026-09-07T10:00:00Z", "broken")).toMatchObject({
      valid: false,
    });
  });

  it("preserves explicitly unset times as null", () => {
    expect(parseDeliveryTimes("", "")).toEqual({
      valid: true,
      sendAt: null,
      remindAt: null,
    });
  });

  it("normalizes valid persisted dates for the server contract", () => {
    expect(
      parseDeliveryTimes(
        "2026-09-07T12:00:00+02:00",
        "2026-09-08T12:00:00+02:00",
      ),
    ).toEqual({
      valid: true,
      sendAt: "2026-09-07T10:00:00.000Z",
      remindAt: "2026-09-08T10:00:00.000Z",
    });
  });
});
