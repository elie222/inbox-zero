import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";
import { saveCalendarTokens } from "@/utils/calendar/save-calendar-tokens";

vi.mock("@/utils/prisma");

describe("saveCalendarTokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves refreshed tokens with the expected expiry guard", async () => {
    const expectedExpiresAt = 1_700_000_000_000;
    const refreshedExpiresAt = new Date("2026-05-09T12:00:00.000Z");
    prisma.calendarConnection.updateMany.mockResolvedValue({ count: 1 } as any);

    const result = await saveCalendarTokens({
      tokens: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: refreshedExpiresAt,
      },
      connectionId: "calendar-connection-id",
      expectedExpiresAt,
      logger: createMockLogger(),
    });

    expect(result).toEqual({ status: "saved" });
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
        expiresAt: refreshedExpiresAt,
      },
    });
    expect(prisma.calendarConnection.update).not.toHaveBeenCalled();
  });

  it("reports a conflict when a concurrent refresh already changed the row", async () => {
    const logger = createMockLogger();
    prisma.calendarConnection.updateMany.mockResolvedValue({ count: 0 } as any);

    const result = await saveCalendarTokens({
      tokens: {
        accessToken: "new-access-token",
        refreshToken: "new-refresh-token",
        expiresAt: new Date("2026-05-09T12:00:00.000Z"),
      },
      connectionId: "calendar-connection-id",
      expectedExpiresAt: 1_700_000_000_000,
      logger,
    });

    expect(result).toEqual({ status: "conflict" });
    expect(logger.info).toHaveBeenCalledWith(
      "Skipped stale calendar token update",
      { connectionId: "calendar-connection-id" },
    );
    expect(prisma.calendarConnection.update).not.toHaveBeenCalled();
  });

  it("does not write partial token responses without an access token", async () => {
    const logger = createMockLogger();

    const result = await saveCalendarTokens({
      tokens: {
        refreshToken: "new-refresh-token",
        expiresAt: new Date("2026-05-09T12:00:00.000Z"),
      },
      connectionId: "calendar-connection-id",
      expectedExpiresAt: 1_700_000_000_000,
      logger,
    });

    expect(result).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      "No access token to save for calendar connection",
      { connectionId: "calendar-connection-id" },
    );
    expect(prisma.calendarConnection.updateMany).not.toHaveBeenCalled();
  });

  it("matches null expiry rows when the previous token had no expiry", async () => {
    prisma.calendarConnection.updateMany.mockResolvedValue({ count: 1 } as any);

    await saveCalendarTokens({
      tokens: {
        accessToken: "new-access-token",
        expiresAt: null,
      },
      connectionId: "calendar-connection-id",
      expectedExpiresAt: null,
      logger: createMockLogger(),
    });

    expect(prisma.calendarConnection.updateMany).toHaveBeenCalledWith({
      where: {
        id: "calendar-connection-id",
        expiresAt: null,
      },
      data: {
        accessToken: "new-access-token",
        refreshToken: undefined,
        expiresAt: null,
      },
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
    flush: vi.fn(),
  } as unknown as Logger;
}
