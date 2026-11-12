"use server";

import { cookies } from "next/headers";
import { actionClientUser } from "@/utils/actions/safe-action";
import { setLocaleBody } from "@/utils/actions/locale.validation";
import { LOCALE_COOKIE } from "@/utils/i18n/locales";

export const setLocaleAction = actionClientUser
  .metadata({ name: "setLocale" })
  .inputSchema(setLocaleBody)
  .action(async ({ parsedInput: { locale } }) => {
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365, // 1 year
      sameSite: "lax",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
    });
  });
