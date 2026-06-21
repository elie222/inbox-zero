import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  sendBookingCancellationEmails,
  sendBookingConfirmationEmails,
  sendBookingRescheduledEmails,
} from "@/utils/booking/emails";

const resendMocks = vi.hoisted(() => ({
  sendGuestBookingConfirmationEmail: vi.fn(),
  sendGuestBookingRescheduledEmail: vi.fn(),
  sendHostBookingCancellationEmail: vi.fn(),
  sendHostBookingConfirmationEmail: vi.fn(),
  sendHostBookingRescheduledEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_BASE_URL: "https://example.com",
    RESEND_FROM_EMAIL: "from@example.com",
  },
}));
vi.mock("@inboxzero/resend", () => resendMocks);

const logger = createTestLogger();

describe("booking emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resendMocks.sendGuestBookingConfirmationEmail.mockResolvedValue(undefined);
    resendMocks.sendGuestBookingRescheduledEmail.mockResolvedValue(undefined);
    resendMocks.sendHostBookingCancellationEmail.mockResolvedValue(undefined);
    resendMocks.sendHostBookingConfirmationEmail.mockResolvedValue(undefined);
    resendMocks.sendHostBookingRescheduledEmail.mockResolvedValue(undefined);
  });

  it("uses the host name when present", async () => {
    await sendBookingConfirmationEmails({
      booking: bookingEmailPayload(),
      guestTimezone: "UTC",
      cancelUrl: "https://example.com/book/cancel/booking-uid?token=token",
      rescheduleUrl:
        "https://example.com/book/reschedule/booking-uid?token=token",
      logger,
    });

    expect(resendMocks.sendGuestBookingConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailProps: expect.objectContaining({
          hostName: "Host User",
        }),
        to: "guest@example.com",
      }),
    );
    expect(resendMocks.sendHostBookingConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "host@example.com",
      }),
    );
  });

  it("uses URL custom locations as guest meeting links", async () => {
    await sendBookingConfirmationEmails({
      booking: bookingEmailPayload({
        bookingLink: {
          locationType: BookingLinkLocationType.CUSTOM,
          locationValue: "https://video.example.com/meeting",
        },
      }),
      guestTimezone: "UTC",
      cancelUrl: "https://example.com/book/cancel/booking-uid?token=token",
      rescheduleUrl:
        "https://example.com/book/reschedule/booking-uid?token=token",
      logger,
    });

    expect(resendMocks.sendGuestBookingConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailProps: expect.objectContaining({
          location: "https://video.example.com/meeting",
          meetingLink: "https://video.example.com/meeting",
        }),
      }),
    );
  });

  it("prefers provider generated video links for guest meeting links", async () => {
    await sendBookingConfirmationEmails({
      booking: bookingEmailPayload({
        videoConferenceLink: "https://teams.example.com/meeting",
        bookingLink: {
          locationType: BookingLinkLocationType.MICROSOFT_TEAMS,
          locationValue: null,
        },
      }),
      guestTimezone: "UTC",
      cancelUrl: "https://example.com/book/cancel/booking-uid?token=token",
      rescheduleUrl:
        "https://example.com/book/reschedule/booking-uid?token=token",
      logger,
    });

    expect(resendMocks.sendGuestBookingConfirmationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailProps: expect.objectContaining({
          location: "Microsoft Teams",
          meetingLink: "https://teams.example.com/meeting",
        }),
      }),
    );
  });

  it("sends reschedule emails to guest and host with previous time", async () => {
    await sendBookingRescheduledEmails({
      booking: bookingEmailPayload(),
      previousStartTime: new Date("2026-05-04T09:00:00.000Z"),
      guestTimezone: "UTC",
      cancelUrl: "https://example.com/book/cancel/booking-uid?token=token",
      rescheduleUrl:
        "https://example.com/book/reschedule/booking-uid?token=token",
      logger,
    });

    expect(resendMocks.sendGuestBookingRescheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "guest@example.com",
        emailProps: expect.objectContaining({
          rescheduleUrl:
            "https://example.com/book/reschedule/booking-uid?token=token",
          cancelUrl: "https://example.com/book/cancel/booking-uid?token=token",
          previousFormattedTime: expect.any(String),
        }),
      }),
    );
    expect(resendMocks.sendHostBookingRescheduledEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "host@example.com",
        emailProps: expect.objectContaining({
          previousFormattedTime: expect.any(String),
        }),
      }),
    );
  });

  it("sends cancellation reason to the host email", async () => {
    await sendBookingCancellationEmails({
      booking: bookingEmailPayload({
        cancellationReason: "No longer needed",
      }),
      logger,
    });

    expect(resendMocks.sendHostBookingCancellationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailProps: expect.objectContaining({
          reason: "No longer needed",
        }),
      }),
    );
  });
});

function bookingEmailPayload(
  overrides: Partial<
    Parameters<typeof sendBookingConfirmationEmails>[0]["booking"]
  > = {},
): Parameters<typeof sendBookingConfirmationEmails>[0]["booking"] {
  const base: Parameters<typeof sendBookingConfirmationEmails>[0]["booking"] = {
    cancellationReason: null,
    endTime: new Date("2026-05-04T09:30:00.000Z"),
    guestEmail: "guest@example.com",
    guestName: "Guest User",
    guestNote: "Please share an agenda.",
    id: "booking-id",
    startTime: new Date("2026-05-04T09:00:00.000Z"),
    bookingLink: {
      title: "Intro call",
      locationType: BookingLinkLocationType.CUSTOM,
      locationValue: "Conference room",
      availabilitySchedule: {
        timezone: "UTC",
      },
      emailAccount: {
        email: "host@example.com",
        name: "Host User",
      },
    },
  };

  return {
    ...base,
    ...overrides,
    bookingLink: {
      ...base.bookingLink,
      ...overrides.bookingLink,
    },
  };
}
