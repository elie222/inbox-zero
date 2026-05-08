import type { calendar_v3 } from "@googleapis/calendar";

export type CalendarAvailabilityErrorDetail = {
  calendarId: string;
  errors: calendar_v3.Schema$Error[];
};

export class CalendarAvailabilityError extends Error {
  provider: "google" | "microsoft";
  calendarErrors: CalendarAvailabilityErrorDetail[];

  constructor({
    provider,
    calendarErrors,
  }: {
    provider: "google" | "microsoft";
    calendarErrors: CalendarAvailabilityErrorDetail[];
  }) {
    const providerLabel = provider === "google" ? "Google" : "Microsoft";
    super(`Failed to fetch ${providerLabel} calendar availability`);
    this.name = "CalendarAvailabilityError";
    this.provider = provider;
    this.calendarErrors = calendarErrors;
  }
}

export function getCalendarAvailabilityErrorLogContext(error: unknown) {
  const calendarAvailabilityError = getCalendarAvailabilityError(error);
  if (!calendarAvailabilityError) return {};

  return {
    provider: calendarAvailabilityError.provider,
    calendarErrors: calendarAvailabilityError.calendarErrors.map(
      ({ calendarId, errors }) => ({
        calendarIdIsPrimary: calendarId === "primary",
        errors: errors.map((error) => ({
          domain: error.domain,
          reason: error.reason,
        })),
      }),
    ),
  };
}

function getCalendarAvailabilityError(
  error: unknown,
): CalendarAvailabilityError | undefined {
  if (error instanceof CalendarAvailabilityError) return error;
  if (typeof error !== "object" || error === null) return;

  const candidate = error as Partial<CalendarAvailabilityError>;
  if (
    candidate.name === "CalendarAvailabilityError" &&
    (candidate.provider === "google" || candidate.provider === "microsoft") &&
    Array.isArray(candidate.calendarErrors)
  ) {
    return candidate as CalendarAvailabilityError;
  }
}
