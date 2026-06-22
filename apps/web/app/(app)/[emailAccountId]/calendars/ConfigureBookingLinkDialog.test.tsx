/** @vitest-environment jsdom */

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingLinkLocationType } from "@/generated/prisma/enums";
import { ConfigureBookingLinkDialog } from "./ConfigureBookingLinkDialog";

(globalThis as { React?: typeof React }).React = React;

const mockUseBookingLinks = vi.fn();
const mockUseAccount = vi.fn();

vi.mock("@/hooks/useBookingLinks", () => ({
  useBookingLinks: () => mockUseBookingLinks(),
}));

vi.mock("@/providers/EmailAccountProvider", () => ({
  useAccount: () => mockUseAccount(),
}));

vi.mock("@/utils/actions/booking", () => ({
  deleteBookingLinkAction: vi.fn(),
  updateBookingLinkAction: vi.fn(),
}));

vi.mock("next-safe-action/hooks", () => ({
  useAction: () => ({ executeAsync: vi.fn(), isExecuting: false }),
}));

afterEach(() => {
  cleanup();
});

describe("ConfigureBookingLinkDialog", () => {
  beforeEach(() => {
    mockUseAccount.mockReturnValue({ emailAccountId: "email-account-id" });
    mockUseBookingLinks.mockReturnValue({ data: bookingLinksData() });
  });

  it("does not show calendar availability as a booking link configuration tab", () => {
    render(
      <ConfigureBookingLinkDialog
        link={bookingLinksData().bookingLinks[0]}
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "General" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Advanced" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Availability" })).toBeNull();
  });
});

function bookingLinksData() {
  return {
    timezone: "UTC",
    bookingLinks: [
      {
        id: "booking-link-id",
        slug: "booking-link",
        title: "Booking link",
        description: "",
        isActive: true,
        durationMinutes: 30,
        locationType: BookingLinkLocationType.GOOGLE_MEET,
        locationValue: null,
        minimumNoticeMinutes: 120,
        maxDaysAhead: 60,
        destinationCalendarId: "calendar-id",
        destinationCalendar: {
          id: "calendar-id",
          name: "Primary calendar",
          calendarId: "primary",
          primary: true,
        },
        timezone: "UTC",
        windows: [],
      },
    ],
    calendarConnections: [
      {
        id: "connection-id",
        provider: "google",
        email: "user@example.com",
        calendars: [
          {
            id: "calendar-id",
            name: "Primary calendar",
            primary: true,
            timezone: "UTC",
            isEnabled: true,
          },
        ],
      },
    ],
  };
}
