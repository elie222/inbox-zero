"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { LAST_EMAIL_ACCOUNT_COOKIE } from "@/utils/cookies";
import { actionClientUser } from "@/utils/actions/safe-action";

/**
 * Sets a cookie with the last selected email account ID.
 * This is used when emailAccountId is not provided in the URL.
 */
export const setLastEmailAccountAction = actionClientUser
  .metadata({ name: "setLastEmailAccount" })
  .schema(z.object({ emailAccountId: z.string() }))
  .action(async ({ parsedInput: { emailAccountId } }) => {
    const cookieStore = await cookies();

    cookieStore.set(LAST_EMAIL_ACCOUNT_COOKIE, emailAccountId, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  });

// Not secure. Only used for redirects. Still requires checking user owns the account.
export async function getLastEmailAccountFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(LAST_EMAIL_ACCOUNT_COOKIE)?.value;
  return value || null;
}

/**
 * Clears the last email account cookie.
 * Called on logout to prevent stale account IDs when switching users.
 */
export const clearLastEmailAccountAction = actionClientUser
  .metadata({ name: "clearLastEmailAccount" })
  .action(async () => {
    const cookieStore = await cookies();
    cookieStore.delete(LAST_EMAIL_ACCOUNT_COOKIE);
  });
