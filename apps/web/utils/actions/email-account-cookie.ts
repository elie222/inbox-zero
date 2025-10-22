"use server";

import { cookies } from "next/headers";
import { LAST_EMAIL_ACCOUNT_COOKIE } from "@/utils/cookies";

/**
 * Sets a cookie with the last selected email account ID.
 * This is used when emailAccountId is not provided in the URL.
 */
export async function setLastEmailAccountAction(emailAccountId: string) {
  const cookieStore = await cookies();

  cookieStore.set(LAST_EMAIL_ACCOUNT_COOKIE, emailAccountId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

// Not secure. Only used for redirects. Still requires checking user owns the account.
export async function getLastEmailAccountFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LAST_EMAIL_ACCOUNT_COOKIE)?.value;
  return value || null;
}
