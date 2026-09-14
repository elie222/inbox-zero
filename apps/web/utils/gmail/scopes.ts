import { env } from "@/env";

const GOOGLE_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts";
const GOOGLE_OTHER_CONTACTS_SCOPE =
  "https://www.googleapis.com/auth/contacts.other.readonly";

export const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",

  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.settings.basic",
] as const;

export const SCOPES = [
  ...REQUIRED_SCOPES,
  // Saved Contacts and Other Contacts are optional and were requested at
  // different times. Accounts consented before either was requested keep
  // working with whichever they hold.
  ...(env.NEXT_PUBLIC_CONTACTS_ENABLED ? [GOOGLE_CONTACTS_SCOPE] : []),
  // Other Contacts is a separate sensitive scope and must not be requested in
  // production until Google verifies it.
  ...(env.NEXT_PUBLIC_CONTACTS_ENABLED &&
  env.NEXT_PUBLIC_GMAIL_OTHER_CONTACTS_ENABLED
    ? [GOOGLE_OTHER_CONTACTS_SCOPE]
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
