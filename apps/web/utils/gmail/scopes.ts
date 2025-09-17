import { env } from "@/env";

export const SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",

  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
  ...(env.NEXT_PUBLIC_CONTACTS_ENABLED
    ? ["https://www.googleapis.com/auth/contacts"]
    : []),
];

export const CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events", // For writing/creating events in the future
  "https://www.googleapis.com/auth/calendar.freebusy", // For checking free/busy status
  // "https://www.googleapis.com/auth/calendar.settings.readonly", // For reading calendar settings
  // "https://www.googleapis.com/auth/calendar.settings", // For modifying calendar settings
  // "https://www.googleapis.com/auth/calendar.calendars.readonly", // For reading calendar metadata
  // "https://www.googleapis.com/auth/calendar.calendars", // For creating/managing calendars
];
