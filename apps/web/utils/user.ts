"use client";

import { signOut } from "@/utils/auth-client";
import { clearLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
import { redirectToSafeUrl } from "@/utils/redirect";
import { clearEmailCache } from "@/utils/email-cache/database";

export async function logOut(callbackUrl?: string) {
  clearLastEmailAccountAction();
  await clearEmailCache();

  await signOut({
    fetchOptions: {
      onSuccess: () => {
        redirectToSafeUrl(callbackUrl);
      },
      onError: () => {
        redirectToSafeUrl(callbackUrl);
      },
    },
  });
}
