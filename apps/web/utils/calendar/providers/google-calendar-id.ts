export function isGoogleVirtualCalendarId(calendarId: string) {
  return calendarId.endsWith("@group.v.calendar.google.com");
}
