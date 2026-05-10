import type { calendar_v3 } from "@googleapis/calendar";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

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
  if (typeof error !== "object" || error === null) return;

  const candidate = error as Partial<CalendarAvailabilityError>;
  if (
    candidate.name === "CalendarAvailabilityError" &&
    (isGoogleProvider(candidate.provider) ||
      isMicrosoftProvider(candidate.provider)) &&
    Array.isArray(candidate.calendarErrors) &&
    candidate.calendarErrors.every(isCalendarAvailabilityErrorDetail)
  ) {
    return candidate as CalendarAvailabilityError;
  }
}

function isCalendarAvailabilityErrorDetail(
  value: unknown,
): value is CalendarAvailabilityErrorDetail {
  if (typeof value !== "object" || value === null) return false;
  const detail = value as Partial<CalendarAvailabilityErrorDetail>;
  return (
    typeof detail.calendarId === "string" &&
    Array.isArray(detail.errors) &&
    detail.errors.every(isCalendarAvailabilityProviderError)
  );
}

function isCalendarAvailabilityProviderError(
  value: unknown,
): value is calendar_v3.Schema$Error {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const error = value as Partial<calendar_v3.Schema$Error>;
  return (
    (error.domain === undefined || typeof error.domain === "string") &&
    (error.reason === undefined || typeof error.reason === "string")
  );
}
