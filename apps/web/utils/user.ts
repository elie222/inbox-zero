"use client";

import { clearOfflineMailCache } from "@/utils/offline/clear-mail-cache";
import { signOut } from "@/utils/auth-client";
import { clearLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
import { redirectToSafeUrl } from "@/utils/redirect";
import { clearLocalReplyDrafts } from "@/utils/mail-engine/reply-drafts";
import { clearPersistedSwrCache } from "@/utils/swr-persistence";

export async function logOut(callbackUrl?: string) {
  clearLastEmailAccountAction();
  clearPersistedSwrCache();
  clearLocalReplyDrafts();
  await clearOfflineMailCache();

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
