import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import {
  isConnectionUsable,
  upsertCalendarConnection,
} from "@/utils/calendar/oauth-callback-helpers";
import { createCalendarEventProviders } from "@/utils/calendar/event-provider";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/calendar/providers/google-events", () => ({
  GoogleCalendarEventProvider: function GoogleCalendarEventProvider() {
    return { fetchEvents: vi.fn() };
  },
}));
vi.mock("@/utils/calendar/providers/microsoft-events", () => ({
  MicrosoftCalendarEventProvider: function MicrosoftCalendarEventProvider() {
    return { fetchEvents: vi.fn() };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

// A calendar whose sync failed, or whose refresh token died, leaves a row
// behind that reads as connected to nothing that matters. Reconnecting is the
// only way back, so it has to land on that row instead of being waved off.
describe("isConnectionUsable", () => {
  it("accepts a connected row that still has its refresh token", () => {
    expect(
      isConnectionUsable({ isConnected: true, refreshToken: "token" }),
    ).toBe(true);
  });

  it("rejects a row a failed sync marked disconnected", () => {
    expect(
      isConnectionUsable({ isConnected: false, refreshToken: "token" }),
    ).toBe(false);
  });

  it("rejects a connected row that lost its refresh token", () => {
    expect(isConnectionUsable({ isConnected: true, refreshToken: null })).toBe(
      false,
    );
  });
});

describe("upsertCalendarConnection", () => {
  it("re-arms an existing row rather than creating a duplicate", async () => {
    prisma.calendarConnection.upsert.mockResolvedValue({ id: "conn_1" });

    await upsertCalendarConnection({
      provider: "google",
      email: "chris@nucar.com",
      emailAccountId: "acc_1",
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      expiresAt: new Date("2026-08-01"),
    });

    const call = prisma.calendarConnection.upsert.mock.calls[0][0];
    // Targets the unique triple, so a reconnect can't trip the constraint
    expect(call.where).toEqual({
      emailAccountId_provider_email: {
        emailAccountId: "acc_1",
        provider: "google",
        email: "chris@nucar.com",
      },
    });
    // The point of the fix: a broken row comes back connected
    expect(call.update).toMatchObject({
      accessToken: "fresh-access",
      refreshToken: "fresh-refresh",
      isConnected: true,
    });
    expect(call.create).toMatchObject({ isConnected: true });
  });
});

describe("createCalendarEventProviders", () => {
  it("skips a connection with no refresh token", async () => {
    prisma.calendarConnection.findMany.mockResolvedValue([
      {
        id: "conn_1",
        provider: "google",
        accessToken: "access",
        refreshToken: null,
        expiresAt: null,
      },
    ]);

    const providers = await createCalendarEventProviders(
      "acc_1",
      createTestLogger(),
    );

    expect(providers).toHaveLength(0);
  });

  it("builds a provider for a healthy connection", async () => {
    prisma.calendarConnection.findMany.mockResolvedValue([
      {
        id: "conn_1",
        provider: "google",
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: null,
      },
    ]);

    const providers = await createCalendarEventProviders(
      "acc_1",
      createTestLogger(),
    );

    expect(providers).toHaveLength(1);
  });
});
