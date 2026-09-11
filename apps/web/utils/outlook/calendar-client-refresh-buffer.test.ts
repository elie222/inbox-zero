import { Client } from "@microsoft/microsoft-graph-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { requestMicrosoftToken } from "@/utils/microsoft/oauth";
import { getCalendarClientWithRefresh } from "./calendar-client";

vi.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    initWithMiddleware: vi.fn(),
  },
}));

vi.mock("@/utils/prisma");

vi.mock("@/utils/microsoft/oauth", () => ({
  getMicrosoftGraphClientOptions: vi.fn(() => ({
    baseUrl: "http://localhost:4003/",
  })),
  getMicrosoftOauthAuthorizeUrl: vi.fn(
    () => "http://localhost:4003/oauth2/v2.0/authorize",
  ),
  requestMicrosoftToken: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    MICROSOFT_CLIENT_ID: "client-id",
    MICROSOFT_CLIENT_SECRET: "client-secret",
    NEXT_PUBLIC_BASE_URL: "http://localhost:3000",
  },
}));

describe("getCalendarClientWithRefresh token buffer", () => {
  const now = new Date("2026-01-01T00:00:00.000Z");

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.mocked(Client.initWithMiddleware).mockReturnValue({} as any);
    vi.mocked(requestMicrosoftToken).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        access_token: "new-access-token",
        refresh_token: "new-refresh-token",
        expires_in: 3600,
      }),
    } as any);
    prisma.calendarConnection.updateMany.mockResolvedValue({ count: 1 });
    prisma.calendarConnection.findFirst.mockResolvedValue({
      id: "calendar-connection-id",
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([
    9 * 60 * 1000,
    10 * 60 * 1000,
  ])("refreshes a cached token with %i milliseconds remaining", async (remainingMs) => {
    await getCalendarClientWithRefresh({
      accessToken: "cached-access-token",
      refreshToken: "refresh-token",
      expiresAt: now.getTime() + remainingMs,
      emailAccountId: "email-account-id",
      logger: createTestLogger(),
    });

    expect(requestMicrosoftToken).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-id",
        client_secret: "client-secret",
        refresh_token: "refresh-token",
        grant_type: "refresh_token",
      }),
    );
    const options = vi.mocked(Client.initWithMiddleware).mock.calls[0][0];
    expect(await options.authProvider.getAccessToken()).toBe(
      "new-access-token",
    );
    expect(Client.initWithMiddleware).toHaveBeenCalledWith({
      authProvider: expect.any(Object),
      baseUrl: "http://localhost:4003/",
    });
  });

  it("reuses a cached token beyond the ten-minute buffer", async () => {
    await getCalendarClientWithRefresh({
      accessToken: "cached-access-token",
      refreshToken: "refresh-token",
      expiresAt: now.getTime() + 10 * 60 * 1000 + 1,
      emailAccountId: "email-account-id",
      logger: createTestLogger(),
    });

    expect(requestMicrosoftToken).not.toHaveBeenCalled();
    expect(prisma.calendarConnection.updateMany).not.toHaveBeenCalled();
    const options = vi.mocked(Client.initWithMiddleware).mock.calls[0][0];
    expect(await options.authProvider.getAccessToken()).toBe(
      "cached-access-token",
    );
  });
});
