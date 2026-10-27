import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { generateSignedOAuthState } from "@/utils/oauth/state";
import { isGoogleCalendarCallback } from "./shared-oauth-callback";
import { CALENDAR_STATE_COOKIE_NAME } from "./constants";
vi.mock("@/env", () => ({
  env: { AUTH_SECRET: "test-calendar-shared-callback-secret" },
}));

function request(state: string, cookie?: string) {
  return new NextRequest(
    `http://localhost:3000/api/google/linking/callback?state=${encodeURIComponent(state)}`,
    {
      headers: cookie
        ? { cookie: `${CALENDAR_STATE_COOKIE_NAME}=${cookie}` }
        : {},
    },
  );
}
describe("shared Google Calendar callback", () => {
  it("routes only signed Calendar state bound to its own browser cookie", () => {
    const state = generateSignedOAuthState({
      type: "calendar",
      emailAccountId: "account",
    });
    expect(isGoogleCalendarCallback(request(state, state))).toBe(true);
    expect(isGoogleCalendarCallback(request(state))).toBe(false);
    expect(isGoogleCalendarCallback(request(state, `${state}tampered`))).toBe(
      false,
    );
    expect(
      isGoogleCalendarCallback(request(`${state}tampered`, `${state}tampered`)),
    ).toBe(false);
  });
  it("keeps linking state and unsigned input out of Calendar token exchange", () => {
    const linking = generateSignedOAuthState({ userId: "user" });
    expect(isGoogleCalendarCallback(request(linking, linking))).toBe(false);
    const unsigned = JSON.stringify({
      type: "calendar",
      emailAccountId: "account",
    });
    expect(isGoogleCalendarCallback(request(unsigned, unsigned))).toBe(false);
  });
});
