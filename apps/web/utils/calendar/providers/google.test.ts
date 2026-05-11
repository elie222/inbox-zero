import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { createGoogleCalendarProvider } from "@/utils/calendar/providers/google";
import {
  fetchGoogleCalendars,
  getCalendarClientWithRefresh,
  getCalendarOAuth2Client,
} from "@/utils/calendar/client";
import {
  fetchGoogleOpenIdProfile,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";

const logger = createTestLogger();
const getToken = vi.fn();
const verifyIdToken = vi.fn();

vi.mock("@/utils/calendar/client", () => ({
  fetchGoogleCalendars: vi.fn(),
  getCalendarClientWithRefresh: vi.fn(),
  getCalendarOAuth2Client: vi.fn(),
}));

vi.mock("@/utils/google/oauth", () => ({
  fetchGoogleOpenIdProfile: vi.fn(),
  isGoogleOauthEmulationEnabled: vi.fn(),
}));

vi.mock("@/utils/prisma", () => ({
  default: {
    calendar: { upsert: vi.fn() },
    calendarConnection: { update: vi.fn() },
  },
}));

vi.mock("../timezone-helpers", () => ({
  autoPopulateTimezone: vi.fn(),
}));

describe("google calendar oauth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCalendarOAuth2Client).mockReturnValue({
      getToken,
      verifyIdToken,
    } as any);
  });

  it("uses OpenID userinfo for emulator token exchange", async () => {
    vi.mocked(isGoogleOauthEmulationEnabled).mockReturnValue(true);
    getToken.mockResolvedValue({
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
        expiry_date: 123,
      },
    });
    vi.mocked(fetchGoogleOpenIdProfile).mockResolvedValue({
      sub: "sub-1",
      email: "user@example.com",
    } as any);

    const provider = createGoogleCalendarProvider(logger);

    await expect(provider.exchangeCodeForTokens("code")).resolves.toEqual({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(123),
      email: "user@example.com",
    });
    expect(fetchGoogleOpenIdProfile).toHaveBeenCalledWith("access-token");
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("fails when emulator profile does not include an email", async () => {
    vi.mocked(isGoogleOauthEmulationEnabled).mockReturnValue(true);
    getToken.mockResolvedValue({
      tokens: {
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
    });
    vi.mocked(fetchGoogleOpenIdProfile).mockResolvedValue({
      sub: "sub-1",
    } as any);

    const provider = createGoogleCalendarProvider(logger);

    await expect(provider.exchangeCodeForTokens("code")).rejects.toThrow(
      "Could not get email from Google profile",
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("syncs Google calendars enabled by default while preserving user toggles on update", async () => {
    vi.mocked(getCalendarClientWithRefresh).mockResolvedValue(
      "calendar-client" as any,
    );
    vi.mocked(fetchGoogleCalendars).mockResolvedValue([
      {
        id: "user@example.com",
        summary: "Primary calendar",
        primary: true,
        timeZone: "Asia/Jerusalem",
      },
      {
        id: "en-gb.usa#holiday@group.v.calendar.google.com",
        summary: "Holidays in the United States",
        description: "Holidays and Observances in the United States",
        timeZone: "Asia/Jerusalem",
      },
    ] as any);

    const provider = createGoogleCalendarProvider(logger);

    await provider.syncCalendars(
      "connection-id",
      "access-token",
      "refresh-token",
      "email-account-id",
      new Date("2026-05-08T00:00:00.000Z"),
    );

    const upsertCalls = vi.mocked(prisma.calendar.upsert).mock.calls;
    const primaryUpsert = upsertCalls.find(
      ([call]) =>
        (call as any).where.connectionId_calendarId.calendarId ===
        "user@example.com",
    )?.[0] as any;
    const virtualUpsert = upsertCalls.find(
      ([call]) =>
        (call as any).where.connectionId_calendarId.calendarId ===
        "en-gb.usa#holiday@group.v.calendar.google.com",
    )?.[0] as any;

    expect(primaryUpsert.create).toMatchObject({
      isEnabled: true,
      primary: true,
    });
    expect(primaryUpsert.update).toMatchObject({ primary: true });
    expect(primaryUpsert.update).not.toHaveProperty("isEnabled");

    expect(virtualUpsert.create).toMatchObject({
      isEnabled: true,
      primary: false,
    });
    expect(virtualUpsert.update).toMatchObject({ primary: false });
    // Re-syncing must not overwrite a user's manual toggle of isEnabled on a
    // virtual calendar.
    expect(virtualUpsert.update).not.toHaveProperty("isEnabled");
  });
});
