"use client";

import { useEffect } from "react";
import {
  retainLocalMailSync,
  setLocalMailSyncPriority,
} from "@/utils/email-cache/local-mail-sync-runtime";

export function useLocalMailSync({
  emailAccountId,
  enabled,
  priority,
}: {
  emailAccountId: string;
  enabled: boolean;
  priority: boolean;
}) {
  useEffect(() => {
    if (enabled) return retainLocalMailSync(emailAccountId, false);
  }, [emailAccountId, enabled]);
  useEffect(() => {
    if (enabled) setLocalMailSyncPriority(emailAccountId, priority);
  }, [emailAccountId, enabled, priority]);
}
