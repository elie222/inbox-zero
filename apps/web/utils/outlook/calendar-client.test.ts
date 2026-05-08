import { Client } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { SafeError } from "@/utils/error";
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

const logger = createTestLogger();

describe("getCalendarClientWithRefresh", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("marks Microsoft calendar disconnected and throws a reconnect SafeError for invalid_grant", async () => {
    vi.mocked(requestMicrosoftToken).mockResolvedValue(
      tokenErrorResponse("invalid_grant: refresh token revoked"),
    );

    await expect(refreshExpiredCalendarClient()).rejects.toMatchObject({
      name: "SafeError",
      safeMessage:
        "Your Microsoft calendar authorization has expired. Please reconnect your calendar.",
    });

    expect(prisma.calendarConnection.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        provider: "microsoft",
        isConnected: true,
      },
      data: { isConnected: false },
    });
    expect(Client.initWithMiddleware).not.toHaveBeenCalled();
  });

  it("marks Microsoft calendar disconnected and throws a reconnect SafeError for AADSTS reauth failures", async () => {
    vi.mocked(requestMicrosoftToken).mockResolvedValue(
      tokenErrorResponse(
        "AADSTS50173: The provided grant has expired due to it being revoked.",
      ),
    );

    await expect(refreshExpiredCalendarClient()).rejects.toBeInstanceOf(
      SafeError,
    );

    expect(prisma.calendarConnection.updateMany).toHaveBeenCalledWith({
      where: {
        emailAccountId: "email-account-id",
        provider: "microsoft",
        isConnected: true,
      },
      data: { isConnected: false },
    });
  });

  it("rethrows non-reauth token refresh failures without disconnecting the calendar", async () => {
    vi.mocked(requestMicrosoftToken).mockResolvedValue(
      tokenErrorResponse("temporarily_unavailable"),
    );

    await expect(refreshExpiredCalendarClient()).rejects.toThrow(
      "temporarily_unavailable",
    );

    expect(prisma.calendarConnection.updateMany).not.toHaveBeenCalled();
  });
});

function refreshExpiredCalendarClient() {
  return getCalendarClientWithRefresh({
    accessToken: "stale-access-token",
    refreshToken: "refresh-token",
    expiresAt: Date.now() - 1000,
    emailAccountId: "email-account-id",
    logger,
  });
}

function tokenErrorResponse(errorDescription: string) {
  return {
    ok: false,
    json: vi.fn().mockResolvedValue({ error_description: errorDescription }),
  } as any;
}
