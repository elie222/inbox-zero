import { beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleCalendarProvider } from "@/utils/calendar/providers/google";
import { getCalendarOAuth2Client } from "@/utils/calendar/client";
import { createTestLogger } from "@/__tests__/helpers";
import {
  fetchGoogleOpenIdProfile,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";

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

    const provider = createGoogleCalendarProvider(createTestLogger());

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

    const provider = createGoogleCalendarProvider(createTestLogger());

    await expect(provider.exchangeCodeForTokens("code")).rejects.toThrow(
      "Could not get email from Google profile",
    );
    expect(verifyIdToken).not.toHaveBeenCalled();
  });
});
