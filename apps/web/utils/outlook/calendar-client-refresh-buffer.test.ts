import { Client } from "@microsoft/microsoft-graph-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    prisma.calendarConnection.findFirst.mockResolvedValue({
      id: "calendar-connection-id",
    } as any);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refreshes a cached token that expires within ten minutes", async () => {
    await getCalendarClientWithRefresh({
      accessToken: "cached-access-token",
      refreshToken: "refresh-token",
      expiresAt: now.getTime() + 9 * 60 * 1000,
      emailAccountId: "email-account-id",
      logger: createMockLogger(),
    });

    expect(requestMicrosoftToken).toHaveBeenCalledWith(
      expect.objectContaining({
        client_id: "client-id",
        client_secret: "client-secret",
        refresh_token: "refresh-token",
        grant_type: "refresh_token",
      }),
    );
    expect(Client.initWithMiddleware).toHaveBeenCalledWith({
      authProvider: expect.any(Object),
      baseUrl: "http://localhost:4003/",
    });
  });
});

function createMockLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    trace: vi.fn(),
    warn: vi.fn(),
    with: vi.fn(),
  };
}
