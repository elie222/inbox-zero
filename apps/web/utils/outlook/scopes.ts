import { env } from "@/env";

export const SCOPES = [
  "openid",
  "profile",
  "email",
  "User.Read",
  "offline_access",
  "Mail.ReadWrite",
  "MailboxSettings.ReadWrite",
  ...(env.NEXT_PUBLIC_CONTACTS_ENABLED ? ["Contacts.ReadWrite"] : []),
];
