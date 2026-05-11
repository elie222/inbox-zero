/** @vitest-environment jsdom */

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CreateBookingLinkDialog } from "./CreateBookingLinkDialog";
import type { BookingLinkCalendarData } from "./booking-calendar-helpers";

(globalThis as { React?: typeof React }).React = React;

afterEach(() => {
  cleanup();
});

describe("CreateBookingLinkDialog", () => {
  it("uses the primary calendar when calendar data loads after opening", async () => {
    const onCreate = vi.fn(async () => {});
    const view = render(
      <CreateBookingLinkDialog
        data={undefined}
        defaultTitle="Booking link"
        defaultSlug="booking-link"
        onClose={() => {}}
        onCreate={onCreate}
        isCreating={false}
      />,
    );

    view.rerender(
      <CreateBookingLinkDialog
        data={calendarData()}
        defaultTitle="Booking link"
        defaultSlug="booking-link"
        onClose={() => {}}
        onCreate={onCreate}
        isCreating={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          destinationCalendarId: "primary-calendar-id",
        }),
      );
    });
  });
});

function calendarData(): BookingLinkCalendarData {
  return {
    calendarConnections: [
      {
        provider: "google",
        calendars: [
          {
            id: "secondary-calendar-id",
            isEnabled: true,
            name: "Secondary calendar",
            primary: false,
          },
          {
            id: "primary-calendar-id",
            isEnabled: true,
            name: "Primary calendar",
            primary: true,
          },
        ],
      },
    ],
  };
}
