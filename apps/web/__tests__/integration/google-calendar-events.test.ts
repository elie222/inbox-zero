import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { auth, calendar } from "@googleapis/calendar";
import { createEmulator, type Emulator } from "emulate";
import { createTestLogger } from "@/__tests__/helpers";
import type { CalendarEventWriteInput } from "@/utils/calendar/event-types";
import { getAvailablePort } from "./helpers";

vi.mock("server-only", () => ({}));

const getCalendarClientWithRefresh = vi.fn();

vi.mock("@/utils/calendar/client", () => ({
  getCalendarClientWithRefresh: (...args: unknown[]) =>
    getCalendarClientWithRefresh(...args),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const EMAIL = "calendar-writer@example.com";

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "Google calendar event writer",
  { timeout: 30_000 },
  () => {
    let emulator: Emulator;
    let calendarClient: ReturnType<typeof calendar>;

    beforeAll(async () => {
      emulator = await createEmulator({
        service: "google",
        port: await getAvailablePort(),
        seed: {
          google: {
            users: [{ email: EMAIL, name: "Calendar Writer" }],
            oauth_clients: [
              {
                client_id: "test-client.apps.googleusercontent.com",
                client_secret: "test-secret",
                redirect_uris: ["http://localhost:3000/callback"],
              },
            ],
            calendars: [
              {
                id: "primary",
                user_email: EMAIL,
                summary: EMAIL,
                primary: true,
                selected: true,
                time_zone: "UTC",
              },
            ],
          },
        },
      });

      const oauth2Client = new auth.OAuth2(
        "test-client.apps.googleusercontent.com",
        "test-secret",
      );
      oauth2Client.setCredentials({ access_token: "emulator-token" });

      calendarClient = calendar({
        version: "v3",
        auth: oauth2Client,
        rootUrl: emulator.url,
      });
      getCalendarClientWithRefresh.mockResolvedValue(calendarClient);
    });

    afterAll(() => emulator?.close());

    test("creates and cancels an event through the Google emulator", async () => {
      const { GoogleCalendarEventProvider } = await import(
        "@/utils/calendar/providers/google-events"
      );
      const provider = new GoogleCalendarEventProvider(
        {
          accessToken: "emulator-token",
          connectionId: "connection-id",
          emailAccountId: "email-account-id",
          expiresAt: Date.now() + 60_000,
          refreshToken: "refresh-token",
        },
        createTestLogger(),
      );
      const input: CalendarEventWriteInput = {
        attendees: [{ name: "Guest User", email: "guest@example.com" }],
        calendarId: "primary",
        description: "Booked with Guest User",
        endTime: new Date("2026-05-04T09:30:00.000Z"),
        locationType: "CUSTOM",
        locationValue: "Conference room",
        startTime: new Date("2026-05-04T09:00:00.000Z"),
        timezone: "UTC",
        title: "Intro call",
      };

      const createdEvent = await provider.createEvent(input);

      expect(createdEvent).toEqual(
        expect.objectContaining({
          id: expect.any(String),
          providerCalendarId: "primary",
        }),
      );

      const eventsAfterCreate = await calendarClient.events.list({
        calendarId: "primary",
        timeMin: "2026-05-04T00:00:00.000Z",
        timeMax: "2026-05-05T00:00:00.000Z",
        singleEvents: true,
      });
      expect(eventsAfterCreate.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: createdEvent.id,
            summary: "Intro call",
            description: "Booked with Guest User",
            location: "Conference room",
          }),
        ]),
      );

      await provider.cancelEvent({
        calendarId: "primary",
        eventId: createdEvent.id,
      });

      const eventsAfterCancel = await calendarClient.events.list({
        calendarId: "primary",
        timeMin: "2026-05-04T00:00:00.000Z",
        timeMax: "2026-05-05T00:00:00.000Z",
        singleEvents: true,
      });
      expect(
        eventsAfterCancel.data.items?.some(
          (event) => event.id === createdEvent.id,
        ),
      ).toBe(false);
    });
  },
);
