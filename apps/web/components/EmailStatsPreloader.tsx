"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function EmailStatsPreloader({
  loadBefore = false,
  delayMs = 0,
}: {
  loadBefore?: boolean;
  delayMs?: number;
}) {
  const { emailAccountId } = useAccount();
  const { onLoad } = useStatLoader();
  const lastPreloadedAccountId = useRef<string | null>(null);

  useEffect(() => {
    if (lastPreloadedAccountId.current === emailAccountId) return;

    lastPreloadedAccountId.current = emailAccountId;

    let cancelled = false;
    const execute = () => {
      onLoad({ loadBefore, showToast: false }).catch(() => undefined);
    };

    if (delayMs > 0) {
      const timer = setTimeout(() => {
        if (!cancelled) execute();
      }, delayMs);
      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }

    execute();
  }, [delayMs, emailAccountId, loadBefore, onLoad]);

  return null;
}
