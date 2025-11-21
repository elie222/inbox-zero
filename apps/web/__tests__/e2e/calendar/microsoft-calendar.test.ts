/**
 * E2E tests for Microsoft Calendar availability
 *
 * Usage:
 * pnpm test-e2e microsoft-calendar
 *
 * Setup:
 * 1. Set TEST_OUTLOOK_EMAIL env var to your Outlook email
 */

import { describe, test, expect, beforeAll, vi } from "vitest";
import prisma from "@/utils/prisma";
import { microsoftAvailabilityProvider } from "@/utils/calendar/providers/microsoft-availability";

// ============================================
// TEST DATA - SET VIA ENVIRONMENT VARIABLES
// ============================================
const RUN_E2E_TESTS = process.env.RUN_E2E_TESTS;
const TEST_OUTLOOK_EMAIL = process.env.TEST_OUTLOOK_EMAIL;

vi.mock("server-only", () => ({}));

describe.skipIf(!RUN_E2E_TESTS)("Outlook Calendar Integration Tests", () => {
  let calendarConnection: {
    id: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: Date | null;
    emailAccountId: string;
  } | null = null;

  let enabledCalendars: Array<{ calendarId: string }> = [];

  beforeAll(async () => {
    const testEmail = TEST_OUTLOOK_EMAIL;

    if (!testEmail) {
      console.warn("\n⚠️  Set TEST_OUTLOOK_EMAIL env var to run these tests");
      console.warn(
        "   Example: TEST_OUTLOOK_EMAIL=your@email.com pnpm test-e2e outlook-calendar\n",
      );
      return;
    }

    // Load account from DB
    const emailAccount = await prisma.emailAccount.findFirst({
      where: {
        email: testEmail,
        account: {
          provider: "microsoft",
        },
      },
      include: {
        account: true,
      },
    });

    if (!emailAccount) {
      throw new Error(`No Outlook account found for ${testEmail}`);
    }

    // Load calendar connection
    const connection = await prisma.calendarConnection.findFirst({
      where: {
        emailAccountId: emailAccount.id,
        provider: "microsoft",
        isConnected: true,
      },
      include: {
        calendars: {
          where: { isEnabled: true },
          select: { calendarId: true },
        },
      },
    });

    if (!connection) {
      console.warn(
        "\n⚠️  No Microsoft calendar connection found for this account",
      );
      console.warn(
        "   Please connect your Microsoft calendar in the app first\n",
      );
      return;
    }

    // Ensure we have valid tokens
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

    console.log(`\n✅ Using account: ${emailAccount.email}`);
    console.log(`   Account ID: ${emailAccount.id}`);
    console.log(`   Calendar connection ID: ${connection.id}`);
    console.log(`   Enabled calendars: ${enabledCalendars.length}\n`);
  });

  describe("Calendar availability", () => {
    test("should fetch calendar busy periods from Microsoft API", async () => {
      if (!calendarConnection || enabledCalendars.length === 0) {
        console.log(
          "   ⚠️  Skipping test - no calendar connection or enabled calendars",
        );
        return;
      }

      // Get tomorrow's date
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 0);

      const tomorrowEnd = new Date(tomorrow);
      tomorrowEnd.setHours(23, 59, 59, 999);

      const timeMin = tomorrow.toISOString();
      const timeMax = tomorrowEnd.toISOString();

      console.log(
        `   📅 Checking availability for: ${tomorrow.toDateString()}`,
      );
      console.log(`   ⏰ Time range: ${timeMin} to ${timeMax}`);
      console.log(
        `   📋 Calendar IDs (${enabledCalendars.length}): ${enabledCalendars.map((c) => `${c.calendarId.substring(0, 20)}...`).join(", ")}`,
      );

      // Use the Microsoft availability provider
      const busyPeriods = await microsoftAvailabilityProvider.fetchBusyPeriods({
        accessToken: calendarConnection.accessToken,
        refreshToken: calendarConnection.refreshToken,
        expiresAt: calendarConnection.expiresAt?.getTime() || null,
        emailAccountId: calendarConnection.emailAccountId,
        calendarIds: enabledCalendars.map((c) => c.calendarId),
        timeMin,
        timeMax,
      });

      console.log("\n   📦 Provider Response:");
      console.log(`   ${"=".repeat(60)}`);
      console.log(`   Total busy periods found: ${busyPeriods.length}`);

      if (busyPeriods.length > 0) {
        console.log("\n   Busy Periods:");
        for (let i = 0; i < busyPeriods.length; i++) {
          const period = busyPeriods[i];
          console.log(`   ${i + 1}. Start: ${period.start}`);
          console.log(`      End:   ${period.end}`);
        }
      } else {
        console.log("\n   ⚠️  No busy periods found!");
        console.log(
          "      This likely means either your calendar is empty, or events are marked as 'Free'",
        );
      }

      console.log(`\n   ${"=".repeat(60)}`);
      console.log("   ✅ Test complete - see logs above for details\n");

      expect(busyPeriods).toBeDefined();
      expect(Array.isArray(busyPeriods)).toBe(true);

      // Verify at least one busy period was found
      // (Assuming your calendar actually has events on tomorrow)
      expect(busyPeriods.length).toBeGreaterThan(0);

      // Verify busy periods have correct structure
      if (busyPeriods.length > 0) {
        expect(busyPeriods[0]).toHaveProperty("start");
        expect(busyPeriods[0]).toHaveProperty("end");
        expect(typeof busyPeriods[0].start).toBe("string");
        expect(typeof busyPeriods[0].end).toBe("string");
      }
    }, 30_000);
  });
});
