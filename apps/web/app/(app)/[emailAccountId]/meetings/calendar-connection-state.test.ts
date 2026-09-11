import { describe, expect, it } from "vitest";
import { hasConnectedCalendar } from "@/app/(app)/[emailAccountId]/meetings/calendar-connection-state";

describe("hasConnectedCalendar", () => {
  it("returns false when every saved calendar connection is disconnected", () => {
    expect(
      hasConnectedCalendar([{ isConnected: false }, { isConnected: false }]),
    ).toBe(false);
  });

  it("returns true when at least one calendar connection is active", () => {
    expect(
      hasConnectedCalendar([{ isConnected: false }, { isConnected: true }]),
    ).toBe(true);
  });
});
