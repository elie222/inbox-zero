// https://learn.microsoft.com/en-us/graph/permissions-reference

import { env } from "@/env";

export const SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "offline_access", // Required for refresh tokens
  "Mail.ReadWrite", // Read and write access to mailbox
  ...(env.NEXT_PUBLIC_EMAIL_SEND_ENABLED ? ["Mail.Send"] : []), // Send emails
  "MailboxSettings.ReadWrite", // Read and write mailbox settings
] as const;

export const CALENDAR_SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "offline_access", // Required for refresh tokens
  "Calendars.Read", // Read user calendars
  "Calendars.ReadWrite", // Read and write user calendars
] as const;
