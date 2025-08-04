"use client";

import { authClient } from "@/utils/auth-client";

export async function logOut(callbackUrl?: string) {
  await authClient.signOut({
    fetchOptions: {
      onSuccess: () => {
        if (callbackUrl) {
          window.location.href = callbackUrl;
        }
      },
    },
  });
}
