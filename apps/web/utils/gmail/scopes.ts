import { env } from "@/env";

const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";

export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",

  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
] as const;

export const SCOPES = [
  ...REQUIRED_SCOPES,
  ...(env.NEXT_PUBLIC_CONTACTS_ENABLED ? [GOOGLE_CONTACTS_SCOPE] : []),
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
