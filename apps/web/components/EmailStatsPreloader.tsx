"use client";

import { useEffect, useRef } from "react";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useStatLoader } from "@/providers/StatLoaderProvider";

export function EmailStatsPreloader({
  loadBefore = false,
}: {
  loadBefore?: boolean;
}) {
  const { emailAccountId } = useAccount();
  const { onLoad } = useStatLoader();
  const lastPreloadedAccountId = useRef<string | null>(null);

  useEffect(() => {
    if (lastPreloadedAccountId.current === emailAccountId) return;

    lastPreloadedAccountId.current = emailAccountId;

    async function preload() {
      await onLoad({ loadBefore, showToast: false });
    }

    preload().catch(() => undefined);
  }, [emailAccountId, loadBefore, onLoad]);

  return null;
}
