"use client";

import { signOut } from "@/utils/auth-client";

export async function logOut(callbackUrl?: string) {
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
