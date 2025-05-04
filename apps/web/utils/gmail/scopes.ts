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
