import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { CalendarConnection } from "@/generated/prisma/client";
import { createTestLogger } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import {
  fetchGoogleCalendars,
  getCalendarOAuth2Client,
} from "@/utils/calendar/client";
import { CALENDAR_STATE_COOKIE_NAME } from "@/utils/calendar/constants";
import { handleCalendarCallback } from "@/utils/calendar/handle-calendar-callback";
import { createGoogleCalendarProvider } from "@/utils/calendar/providers/google";
import { generateSignedOAuthState } from "@/utils/oauth/state";
import {
  acquireOAuthCodeLock,
  clearOAuthCode,
  getOAuthCodeResult,
  setOAuthCodeResult,
} from "@/utils/redis/oauth-code";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-id" } }),
}));
vi.mock("@/utils/redis/oauth-code");
vi.mock("@/utils/calendar/client");
vi.mock("@/utils/google/oauth", () => ({
  isGoogleOauthEmulationEnabled: () => false,
}));

const logger = createTestLogger();
const googleAuth = mockDeep<ReturnType<typeof getCalendarOAuth2Client>>();
const code = "calendar-authorization-code";
const expiresAt = new Date("2026-10-01T12:00:00.000Z");
const connection: CalendarConnection = {
  id: "connection-id",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  updatedAt: new Date("2026-09-01T00:00:00.000Z"),
  provider: "google",
  email: "calendar@example.com",
  emailAccountId: "email-account-id",
  accessToken: "expired-access-token",
  refreshToken: "stored-refresh-token",
  expiresAt: new Date("2026-09-01T01:00:00.000Z"),
  isConnected: false,
};

describe("handleCalendarCallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getOAuthCodeResult).mockResolvedValue(null);
    vi.mocked(acquireOAuthCodeLock).mockResolvedValue(true);
    prisma.emailAccount.findFirst.mockResolvedValue(
      mockDeep({ id: connection.emailAccountId }),
    );
    prisma.calendarConnection.findFirst.mockResolvedValue(connection);
    vi.mocked(getCalendarOAuth2Client).mockReturnValue(googleAuth);
    googleAuth.getToken.mockResolvedValue({
      tokens: {
        access_token: "fresh-access-token",
        refresh_token: "fresh-refresh-token",
        expiry_date: expiresAt.getTime(),
        id_token: "id-token",
      },
      res: null,
    });
    googleAuth.verifyIdToken.mockResolvedValue(
      mockDeep({ getPayload: () => ({ email: connection.email }) }),
    );
  });

  it("reconnects the existing row with fresh tokens without changing calendar settings", async () => {
    const response = await runCallback();

    expect(prisma.calendarConnection.update).toHaveBeenCalledExactlyOnceWith({
      where: { id: connection.id },
      data: {
        accessToken: "fresh-access-token",
        refreshToken: "fresh-refresh-token",
        expiresAt,
        isConnected: true,
      },
    });
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/email-account-id/calendars?message=calendar_connected",
    );
    expect(setOAuthCodeResult).toHaveBeenCalledWith(code, {
      message: "calendar_connected",
    });
    expect(prisma.calendarConnection.create).not.toHaveBeenCalled();
    expect(prisma.calendarConnection.delete).not.toHaveBeenCalled();
    expect(prisma.calendar.upsert).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    null,
    "",
  ])("rejects a reconnect when Google returns %s as the refresh token", async (refreshToken) => {
    googleAuth.getToken.mockResolvedValue({
      tokens: {
        access_token: "fresh-access-token",
        refresh_token: refreshToken,
        id_token: "id-token",
      },
      res: null,
    });

    const response = await runCallback();

    expect(response.headers.get("location")).toContain(
      "error=connection_failed",
    );
    expect(prisma.calendarConnection.update).not.toHaveBeenCalled();
    expect(setOAuthCodeResult).not.toHaveBeenCalled();
  });

  it("rejects a new connection without a refresh token", async () => {
    prisma.calendarConnection.findFirst.mockResolvedValue(null);
    googleAuth.getToken.mockResolvedValue({
      tokens: { access_token: "fresh-access-token", id_token: "id-token" },
      res: null,
    });

    const response = await runCallback();

    expect(response.headers.get("location")).toContain(
      "error=connection_failed",
    );
    expect(prisma.calendarConnection.create).not.toHaveBeenCalled();
    expect(setOAuthCodeResult).not.toHaveBeenCalled();
  });

  it("creates and syncs a new connection when Google returns both tokens", async () => {
    prisma.calendarConnection.findFirst.mockResolvedValue(null);
    prisma.calendarConnection.create.mockResolvedValue(connection);
    vi.mocked(fetchGoogleCalendars).mockResolvedValue([]);

    const response = await runCallback();

    expect(prisma.calendarConnection.create).toHaveBeenCalledExactlyOnceWith({
      data: {
        provider: "google",
        email: connection.email,
        emailAccountId: connection.emailAccountId,
        accessToken: "fresh-access-token",
        refreshToken: "fresh-refresh-token",
        expiresAt,
        isConnected: true,
      },
    });
    expect(fetchGoogleCalendars).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toContain(
      "message=calendar_connected",
    );
  });

  it("rejects a Google response without an access token", async () => {
    googleAuth.getToken.mockResolvedValue({
      tokens: { refresh_token: "fresh-refresh-token", id_token: "id-token" },
      res: null,
    });

    const response = await runCallback();

    expect(response.headers.get("location")).toContain(
      "error=connection_failed",
    );
    expect(prisma.calendarConnection.update).not.toHaveBeenCalled();
    expect(setOAuthCodeResult).not.toHaveBeenCalled();
  });

  it("does not report success when the token update fails", async () => {
    prisma.calendarConnection.update.mockRejectedValue(
      new Error("Database unavailable"),
    );

    const response = await runCallback();

    expect(response.headers.get("location")).toContain(
      "error=connection_failed",
    );
    expect(setOAuthCodeResult).not.toHaveBeenCalled();
    expect(clearOAuthCode).toHaveBeenCalledWith(code);
  });
});

function runCallback() {
  const state = generateSignedOAuthState({
    emailAccountId: connection.emailAccountId,
    type: "calendar",
  });
  const url = new URL("http://localhost:3000/api/google/calendar/callback");
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);
  const request = new NextRequest(url);
  request.cookies.set(CALENDAR_STATE_COOKIE_NAME, state);
  return handleCalendarCallback(
    request,
    createGoogleCalendarProvider(logger),
    logger,
  );
}
