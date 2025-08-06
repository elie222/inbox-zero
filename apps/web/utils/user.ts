"use client";

import { signOut } from "@/utils/auth-client";

export async function logOut(callbackUrl?: string) {
  await signOut({
    fetchOptions: {
      onSuccess: () => {
        if (callbackUrl) {
          window.location.href = callbackUrl;
        }
      },
    },
  });
}
