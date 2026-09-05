import { describe, expect, it } from "vitest";
import { getReminderAfterSendTimeChange } from "./delivery-times";

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
