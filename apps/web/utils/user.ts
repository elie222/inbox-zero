"use client";

import { signOut } from "@/utils/auth-client";
import { clearLastEmailAccountAction } from "@/utils/actions/email-account-cookie";

export async function logOut(callbackUrl?: string) {
  clearLastEmailAccountAction();

  await signOut({
    fetchOptions: {
      onSuccess: () => {
        window.location.href = callbackUrl || "/";
      },
      onError: () => {
        window.location.href = callbackUrl || "/";
      },
    },
  });
}
