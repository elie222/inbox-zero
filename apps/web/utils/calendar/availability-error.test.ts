import { describe, expect, it } from "vitest";
import {
  CalendarAvailabilityError,
  getCalendarAvailabilityErrorLogContext,
} from "@/utils/calendar/availability-error";

describe("getCalendarAvailabilityErrorLogContext", () => {
  it("maps valid calendar availability errors for logging", () => {
    expect(
      getCalendarAvailabilityErrorLogContext(
        new CalendarAvailabilityError({
          provider: "google",
          calendarErrors: [
            {
              calendarId: "primary",
              errors: [{ domain: "global", reason: "notFound" }],
            },
          ],
        }),
      ),
    ).toEqual({
      provider: "google",
      calendarErrors: [
        {
          calendarIdIsPrimary: true,
          errors: [{ domain: "global", reason: "notFound" }],
        },
      ],
    });
  });

  it("ignores serialized availability errors with malformed error details", () => {
    const malformed = {
      name: "CalendarAvailabilityError",
      provider: "google",
      calendarErrors: [
        {
          calendarId: "primary",
          errors: [null],
        },
      ],
    };

    expect(() =>
      getCalendarAvailabilityErrorLogContext(malformed),
    ).not.toThrow();
    expect(getCalendarAvailabilityErrorLogContext(malformed)).toEqual({});
  });
});
