import { BookingLinkLocationType } from "@/generated/prisma/enums";
import {
  isGoogleProvider,
  isMicrosoftProvider,
} from "@/utils/email/provider-types";

export type BookingLinkCalendarData = {
  calendarConnections: Array<{
    provider: string;
    calendars: Array<{
      id: string;
      isEnabled: boolean;
      name: string;
      primary: boolean;
    }>;
  }>;
};

export const DURATION_OPTIONS = [15, 30, 45, 60];

export const PRIMARY_CALENDAR_SELECT_VALUE = "__primary_calendar__";

export function getSelectedCalendarProvider(
  data: BookingLinkCalendarData | undefined,
  destinationCalendarId: string,
) {
  const calendars =
    data?.calendarConnections.flatMap((connection) =>
      connection.calendars.map((calendar) => ({
        id: calendar.id,
        isEnabled: calendar.isEnabled,
        primary: calendar.primary,
        provider: connection.provider,
      })),
    ) ?? [];

  if (destinationCalendarId) {
    return (
      calendars.find((calendar) => calendar.id === destinationCalendarId)
        ?.provider ?? null
    );
  }

  return (
    calendars.find((calendar) => calendar.isEnabled && calendar.primary)
      ?.provider ??
    calendars.find((calendar) => calendar.isEnabled)?.provider ??
    null
  );
}

export function getProviderVideoLocationType(
  provider: string | null | undefined,
) {
  if (isGoogleProvider(provider)) {
    return BookingLinkLocationType.GOOGLE_MEET;
  }
  if (isMicrosoftProvider(provider)) {
    return BookingLinkLocationType.MICROSOFT_TEAMS;
  }
  return null;
}

export function isProviderVideoLocationType(
  locationType: BookingLinkLocationType,
) {
  return (
    locationType === BookingLinkLocationType.GOOGLE_MEET ||
    locationType === BookingLinkLocationType.MICROSOFT_TEAMS
  );
}

export function getVideoLocationLabel(
  locationType: BookingLinkLocationType | null,
) {
  if (locationType === BookingLinkLocationType.GOOGLE_MEET) {
    return "Google Meet";
  }
  if (locationType === BookingLinkLocationType.MICROSOFT_TEAMS) {
    return "Microsoft Teams";
  }
  return null;
}

export function getCalendarOptions(data: BookingLinkCalendarData | undefined) {
  const calendars =
    data?.calendarConnections.flatMap((connection) =>
      connection.calendars.map((calendar) => ({
        label: `${calendar.name}${calendar.primary ? " (Primary)" : ""}`,
        value: calendar.id,
      })),
    ) ?? [];

  return [{ label: "Primary calendar", value: "" }, ...calendars];
}
