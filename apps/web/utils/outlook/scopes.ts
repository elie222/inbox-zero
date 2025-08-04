// https://learn.microsoft.com/en-us/graph/permissions-reference

import { env } from "@/env";

export const SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "offline_access", // Required for refresh tokens
  /* "Mail.ReadWrite", // Read and write access to mailbox
  "Mail.Send", // Send emails
  "Mail.ReadBasic", // Read basic mail properties
  "Mail.Read", // Read mail in all mailboxes
  "Mail.Read.Shared", // Read mail in shared mailboxes
  "MailboxSettings.ReadWrite", // Read and write mailbox settings
  ...(env.NEXT_PUBLIC_CONTACTS_ENABLED ? ["Contacts.ReadWrite"] : []), */
] as const;
