import { Client } from "@microsoft/microsoft-graph-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
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

describe("getCalendarClientWithRefresh token save concurrency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it("saves refreshed Microsoft calendar tokens with optimistic concurrency", async () => {
    const expectedExpiresAt = 1_700_000_000_000;
    prisma.calendarConnection.updateMany.mockResolvedValue({ count: 1 } as any);

    await getCalendarClientWithRefresh({
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: expectedExpiresAt,
      emailAccountId: "email-account-id",
      logger: createMockLogger(),
    });

    expect(prisma.calendarConnection.updateMany).toHaveBeenCalledWith({
      where: {
        id: "calendar-connection-id",
        expiresAt: {
          gte: new Date(expectedExpiresAt),
          lt: new Date(expectedExpiresAt + 1),
        },
      },
      data: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: expect.any(Date),
      },
    });
    expect(prisma.calendarConnection.update).not.toHaveBeenCalled();
  });

  it("skips stale Microsoft calendar token saves when a concurrent refresh already won", async () => {
    const logger = createMockLogger();
    prisma.calendarConnection.updateMany.mockResolvedValue({ count: 0 } as any);

    await getCalendarClientWithRefresh({
      accessToken: "old-access-token",
      refreshToken: "old-refresh-token",
      expiresAt: 1_700_000_000_000,
      emailAccountId: "email-account-id",
      logger,
    });

    expect(prisma.calendarConnection.update).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(
      "Skipped stale calendar token update",
      { connectionId: "calendar-connection-id" },
    );
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
