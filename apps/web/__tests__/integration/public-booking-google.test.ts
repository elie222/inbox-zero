import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from "vitest";
import { auth, calendar } from "@googleapis/calendar";
import { createEmulator, type Emulator } from "emulate";
import prisma from "@/utils/__mocks__/prisma";
import { createTestLogger } from "@/__tests__/helpers";
import { getAvailablePort } from "@/__tests__/integration/helpers";
import {
  BookingLinkLocationType,
  BookingStatus,
} from "@/generated/prisma/enums";
import { createPublicBooking } from "@/utils/booking/public";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/booking/emails", () => ({
  sendBookingConfirmationEmails: vi.fn().mockResolvedValue(undefined),
  sendBookingCancellationEmails: vi.fn().mockResolvedValue(undefined),
}));

const getCalendarClientWithRefresh = vi.fn();

vi.mock("@/utils/calendar/client", () => ({
  getCalendarClientWithRefresh: (...args: unknown[]) =>
    getCalendarClientWithRefresh(...args),
}));

const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS;
const EMAIL = "public-booking@example.com";
const logger = createTestLogger();

describe.skipIf(!RUN_INTEGRATION_TESTS)(
  "public booking with Google Calendar emulator",
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
            users: [{ email: EMAIL, name: "Booking Host" }],
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

    beforeEach(() => {
      vi.clearAllMocks();
      getCalendarClientWithRefresh.mockResolvedValue(calendarClient);
      mockBookingConfig();
    });

    afterAll(() => emulator?.close());

    test("creates a booking only after checking emulator availability", async () => {
      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.findMany.mockResolvedValue([]);
      prisma.booking.create.mockResolvedValue(
        bookingRecord({ status: BookingStatus.PENDING_PROVIDER_EVENT }),
      );
      prisma.booking.update.mockResolvedValue(
        bookingRecord({
          provider: "google",
          providerCalendarId: "primary",
          providerEventId: "provider-event-id",
          status: BookingStatus.CONFIRMED,
        }),
      );

      const result = await createPublicBooking({
        input: {
          slug: "intro",
          startTime: "2030-01-07T09:00:00.000Z",
          timezone: "UTC",
          guestName: "Guest User",
          guestEmail: "guest@example.com",
          idempotencyToken: "token-1",
        },
        logger,
      });

      expect(result.status).toBe(BookingStatus.CONFIRMED);
      expect(getCalendarClientWithRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          connectionId: "connection-id",
          emailAccountId: "email-account-id",
        }),
      );
      expect(prisma.booking.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestEmail: "guest@example.com",
            status: BookingStatus.PENDING_PROVIDER_EVENT,
          }),
        }),
      );

      const events = await calendarClient.events.list({
        calendarId: "primary",
        timeMin: "2030-01-07T00:00:00.000Z",
        timeMax: "2030-01-08T00:00:00.000Z",
        singleEvents: true,
      });
      expect(events.data.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            summary: "Intro call",
            start: expect.objectContaining({
              dateTime: "2030-01-07T09:00:00.000Z",
            }),
            end: expect.objectContaining({
              dateTime: "2030-01-07T09:30:00.000Z",
            }),
          }),
        ]),
      );
    });

    test("rejects a selected slot that the emulator reports as busy", async () => {
      await calendarClient.events.insert({
        calendarId: "primary",
        requestBody: {
          summary: "Existing meeting",
          start: {
            dateTime: "2030-01-07T10:00:00.000Z",
            timeZone: "UTC",
          },
          end: {
            dateTime: "2030-01-07T10:30:00.000Z",
            timeZone: "UTC",
          },
        },
      });

      prisma.booking.findFirst.mockResolvedValue(null);
      prisma.booking.findMany.mockResolvedValue([]);

      await expect(
        createPublicBooking({
          input: {
            slug: "intro",
            startTime: "2030-01-07T10:00:00.000Z",
            timezone: "UTC",
            guestName: "Guest User",
            guestEmail: "guest@example.com",
            idempotencyToken: "token-2",
          },
          logger,
        }),
      ).rejects.toThrow("Selected slot is not available");

      expect(prisma.booking.create).not.toHaveBeenCalled();
    });
  },
);

function mockBookingConfig() {
  prisma.bookingLink.findFirst.mockResolvedValue({
    id: "booking-link-id",
    title: "Intro call",
    description: null,
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    locationType: BookingLinkLocationType.CUSTOM,
    locationValue: "Conference room",
    minimumNoticeMinutes: 0,
    maxDaysAhead: 3650,
    timezone: "UTC",
    emailAccountId: "email-account-id",
    destinationCalendarId: "calendar-row-id",
    windows: [{ weekday: 1, startMinutes: 9 * 60, endMinutes: 11 * 60 }],
    emailAccount: {
      calendarConnections: [
        { id: "connection-id", calendars: [{ id: "calendar-row-id" }] },
      ],
    },
  });

  prisma.calendarConnection.findMany.mockResolvedValue([
    {
      id: "connection-id",
      provider: "google",
      email: EMAIL,
      accessToken: "emulator-token",
      refreshToken: "refresh-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
      isConnected: true,
      emailAccountId: "email-account-id",
      createdAt: new Date("2026-05-01T00:00:00.000Z"),
      updatedAt: new Date("2026-05-01T00:00:00.000Z"),
      calendars: [{ calendarId: "primary" }],
    },
  ]);

  prisma.calendar.findFirst.mockResolvedValue({
    calendarId: "primary",
    connection: {
      id: "connection-id",
      provider: "google",
      accessToken: "emulator-token",
      refreshToken: "refresh-token",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    },
  });
}

function bookingRecord(
  overrides: Partial<ReturnType<typeof bookingRecordBase>>,
) {
  return {
    ...bookingRecordBase(),
    ...overrides,
    bookingLink: {
      ...bookingRecordBase().bookingLink,
      ...overrides.bookingLink,
    },
  };
}

function bookingRecordBase() {
  return {
    id: "booking-id",
    bookingLinkId: "booking-link-id",
    emailAccountId: "email-account-id",
    guestName: "Guest User",
    guestEmail: "guest@example.com",
    guestNote: null,
    startTime: new Date("2030-01-07T09:00:00.000Z"),
    endTime: new Date("2030-01-07T09:30:00.000Z"),
    status: BookingStatus.CONFIRMED,
    provider: null,
    providerConnectionId: null,
    providerCalendarId: null,
    providerEventId: null,
    videoConferenceLink: null,
    cancelTokenHash: "cancel-token-hash",
    cancellationReason: null,
    idempotencyToken: "token-1",
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    bookingLink: {
      title: "Intro call",
      locationType: BookingLinkLocationType.CUSTOM,
      locationValue: "Conference room",
      timezone: "UTC",
      emailAccount: {
        email: EMAIL,
        name: "Booking Host",
      },
    },
  };
}
