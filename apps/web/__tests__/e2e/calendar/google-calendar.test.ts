/**
 * E2E tests for Google Calendar availability
 *
 * Usage:
 * pnpm test-e2e google-calendar
 *
 * Setup:
 * 1. Set TEST_GMAIL_EMAIL env var to your Gmail address
 */

import { describe, test, expect, beforeAll, afterAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { createGoogleAvailabilityProvider } from "@/utils/calendar/providers/google-availability";
import { getCalendarClientWithRefresh } from "@/utils/calendar/client";
import type { calendar_v3 } from "@googleapis/calendar";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_GMAIL_EMAIL = process.env.TEST_GMAIL_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)("Google Calendar Integration Tests", () => {
  let calendarConnection: {
    id: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date | null;
    emailAccountId: string;
  } | null = null;

  let enabledCalendars: Array<{ calendarId: string }> = [];
  let calendarClient: calendar_v3.Calendar | null = null;
  let primaryCalendarId: string | null = null;
  const createdEventIds: Array<{ calendarId: string; eventId: string }> = [];

  beforeAll(async () => {
    const testEmail = TEST_GMAIL_EMAIL;

    if (!testEmail) {
      console.warn("\n⚠️  Set TEST_GMAIL_EMAIL env var to run these tests");
      console.warn(
        "   Example: TEST_GMAIL_EMAIL=your@gmail.com pnpm test-e2e google-calendar\n",
      );
      return;
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      console.warn(
        "\n⚠️  Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.test\n",
      );
      throw new Error(
        "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env.test",
      );
    }

    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        email: testEmail,
        account: {
          provider: "google",
        },
      },
      include: {
        account: true,
      },
    });

    if (!emailAccount) {
      throw new Error(`No Google account found for ${testEmail}`);
    }

    const connection = await prisma.calendarConnection.findFirst({
      where: {
        emailAccountId: emailAccount.id,
        provider: "google",
        isConnected: true,
      },
      include: {
        calendars: {
          where: { isEnabled: true },
          select: { calendarId: true, primary: true },
        },
      },
    });

    if (!connection) {
      console.warn("\n⚠️  No Google calendar connection found for this account");
      console.warn("   Please connect your Google calendar in the app first\n");
      return;
    }

    if (!connection.accessToken || !connection.refreshToken) {
      console.warn(
        "\n⚠️  Calendar connection has no access token or refresh token",
      );
      return;
    }

    calendarConnection = {
      id: connection.id,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt,
      emailAccountId: connection.emailAccountId,
    };
    enabledCalendars = connection.calendars;
    primaryCalendarId =
      connection.calendars.find((c) => c.primary)?.calendarId ||
      connection.calendars[0]?.calendarId ||
      null;

    const logger = createScopedLogger("test/google-calendar");

    calendarClient = await getCalendarClientWithRefresh({
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      expiresAt: connection.expiresAt?.getTime() || null,
      emailAccountId: connection.emailAccountId,
      logger,
    });

    console.log(
      `\n✅ Using account: ${emailAccount.email} (${emailAccount.id})`,
    );
    console.log(
      `   Calendars: ${enabledCalendars.length} enabled, primary: ${primaryCalendarId}\n`,
    );
  });

  afterAll(async () => {
    if (!calendarClient || createdEventIds.length === 0) return;

    console.log(
      `\n   🧹 Cleaning up ${createdEventIds.length} test event(s)...`,
    );

    let deletedCount = 0;
    let failedCount = 0;

    for (const { calendarId, eventId } of createdEventIds) {
      try {
        await calendarClient.events.delete({
          calendarId,
          eventId,
        });
        deletedCount++;
        console.log(`      ✅ Deleted event ${eventId}`);
      } catch (error) {
        failedCount++;
        console.log("      ⚠️  Failed to delete event", {
          eventId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    console.log(
      `   🧹 Cleanup complete: ${deletedCount} deleted, ${failedCount} failed\n`,
    );
  });

  describe("Calendar availability", () => {
    test("should fetch calendar busy periods from Google API", async () => {
      if (!calendarConnection || enabledCalendars.length === 0) {
        console.log(
          "   ⚠️  Skipping test - no calendar connection or enabled calendars",
        );
        return;
      }

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(23, 59, 59, 999);

      const timeMin = tomorrow.toISOString();
      const timeMax = tomorrowEnd.toISOString();

      console.log(
        `\n   📅 Checking ${tomorrow.toDateString()}: ${timeMin} to ${timeMax}`,
      );

      const logger = createScopedLogger("test/google-calendar");
      const googleAvailabilityProvider =
        createGoogleAvailabilityProvider(logger);

      const busyPeriods = await googleAvailabilityProvider.fetchBusyPeriods({
        accessToken: calendarConnection.accessToken,
        refreshToken: calendarConnection.refreshToken,
        expiresAt: calendarConnection.expiresAt?.getTime() || null,
        emailAccountId: calendarConnection.emailAccountId,
        calendarIds: enabledCalendars.map((c) => c.calendarId),
        timeMin,
        timeMax,
      });

      console.log(`   ✅ Found ${busyPeriods.length} busy periods`);
      if (busyPeriods.length > 0) {
        busyPeriods.slice(0, 3).forEach((period, i) => {
          console.log(`      ${i + 1}. ${period.start} → ${period.end}`);
        });
        if (busyPeriods.length > 3)
          console.log(`      ... and ${busyPeriods.length - 3} more`);
      }
      console.log();

      expect(busyPeriods).toBeDefined();
      expect(Array.isArray(busyPeriods)).toBe(true);

      expect(busyPeriods.length).toBeGreaterThan(0);

      if (busyPeriods.length > 0) {
        expect(busyPeriods[0]).toHaveProperty("start");
        expect(busyPeriods[0]).toHaveProperty("end");
        expect(typeof busyPeriods[0].start).toBe("string");
        expect(typeof busyPeriods[0].end).toBe("string");
      }
    }, 30_000);
  });
});
