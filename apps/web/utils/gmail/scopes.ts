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
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar",
  // Advanced calendar scopes for future use:
  // "https://www.googleapis.com/auth/calendar.events.freebusy", // Read free/busy information for events
  // "https://www.googleapis.com/auth/calendar.settings.readonly", // Read calendar settings (timezone, etc.)
  // "https://www.googleapis.com/auth/calendar.settings", // Read and modify calendar settings
  // "https://www.googleapis.com/auth/calendar.addons.execute", // Execute calendar add-ons
  // "https://www.googleapis.com/auth/calendar.freebusy", // Read free/busy information for calendars
];
