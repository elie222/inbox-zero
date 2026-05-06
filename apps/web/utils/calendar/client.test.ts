import { beforeEach, describe, expect, it, vi } from "vitest";
import { auth, calendar } from "@googleapis/calendar";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { getCalendarClientWithRefresh } from "@/utils/calendar/client";
import {
  getGoogleApiRootUrl,
  getGoogleOauthClientOptions,
} from "../google/oauth";

vi.mock("@/utils/prisma");

vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

vi.mock("@/utils/google/oauth", () => ({
  getGoogleApiRootUrl: vi.fn(() => "http://localhost:4444"),
  getGoogleOauthClientOptions: vi.fn((redirectUri?: string) => ({
    clientId: "client-id",
    clientSecret: "client-secret",
    redirectUri,
    endpoints: {
      oauth2TokenUrl: "http://localhost:4444/oauth2/token",
    },
  })),
}));

const setCredentials = vi.fn();
const refreshAccessToken = vi.fn();
const logger = createTestLogger();

vi.mock("@googleapis/calendar", () => ({
  auth: {
    OAuth2: vi.fn(function OAuth2() {
      return {
        setCredentials,
        refreshAccessToken,
      };
    }),
  },
  calendar: vi.fn(),
}));

describe("google calendar client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves refreshed tokens to the requested calendar connection", async () => {
    const refreshedExpiresAt = Date.now() + 3_600_000;
    refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: refreshedExpiresAt,
      },
    });
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      id: "first-google-connection-id",
    } as any);

    await getCalendarClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "target-refresh-token",
      expiresAt: Date.now() - 1000,
      emailAccountId: "email-account-id",
      connectionId: "target-google-connection-id",
      logger,
    });

    expect(prisma.calendarConnection.update).toHaveBeenCalledWith({
      where: { id: "target-google-connection-id" },
      data: {
        accessToken: "new-access-token",
        refreshToken: undefined,
        expiresAt: new Date(refreshedExpiresAt),
      },
    });
    expect(prisma.calendarConnection.findFirst).not.toHaveBeenCalled();
  });

  it("matches the calendar connection by refresh token when no connection id is provided", async () => {
    const refreshedExpiresAt = Date.now() + 3_600_000;
    refreshAccessToken.mockResolvedValue({
      credentials: {
        access_token: "new-access-token",
        expiry_date: refreshedExpiresAt,
      },
    });
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      id: "target-google-connection-id",
    } as any);

    await getCalendarClientWithRefresh({
      accessToken: "stale-access-token",
      refreshToken: "target-refresh-token",
      expiresAt: Date.now() - 1000,
      emailAccountId: "email-account-id",
      logger,
    });

    expect(prisma.calendarConnection.findFirst).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        provider: "google",
        refreshToken: "target-refresh-token",
      },
      select: { id: true },
    });
    expect(prisma.calendarConnection.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "target-google-connection-id" },
      }),
    );
  });

  it("uses emulator-aware OAuth and Calendar API options", async () => {
    await getCalendarClientWithRefresh({
      accessToken: "access-token",
      refreshToken: "refresh-token",
      expiresAt: Date.now() + 3_600_000,
      emailAccountId: "email-account-id",
      logger,
    });

    expect(getGoogleOauthClientOptions).toHaveBeenCalledWith();
    expect(auth.OAuth2).toHaveBeenCalledWith({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: undefined,
      endpoints: {
        oauth2TokenUrl: "http://localhost:4444/oauth2/token",
      },
    });
    expect(getGoogleApiRootUrl).toHaveBeenCalledWith();
    expect(calendar).toHaveBeenCalledWith({
      version: "v3",
      auth: expect.any(Object),
      rootUrl: "http://localhost:4444",
    });
  });
});
