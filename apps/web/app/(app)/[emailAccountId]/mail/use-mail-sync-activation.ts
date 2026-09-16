"use client";

import { useEffect } from "react";
import { activateMailSync } from "@/utils/email-cache/mail-activation";

export function useMailSyncActivation({
  emailAccountId,
  isAllAccounts,
  combinedAccounts,
}: {
  emailAccountId: string;
  isAllAccounts: boolean;
  combinedAccounts: { id: string }[];
}) {
  useEffect(() => {
    // A committed mail screen, rather than route prefetch, activates downloads.
    if (isAllAccounts) {
      for (const account of combinedAccounts) activateMailSync(account.id);
    } else {
      activateMailSync(emailAccountId);
    }
  }, [emailAccountId, isAllAccounts, combinedAccounts]);
}
