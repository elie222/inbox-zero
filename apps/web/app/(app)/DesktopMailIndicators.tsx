"use client";

import { useEffect } from "react";
import type { LabelCountsResponse } from "@/app/api/labels/counts/route";
import { useAccounts } from "@/hooks/useAccounts";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

export function DesktopMailIndicators() {
  const { data } = useAccounts();
  const accountIds = JSON.stringify(
    (data?.emailAccounts ?? [])
      .filter((account) => !account.account.disconnectedAt)
      .map((account) => account.id)
      .sort(),
  );

  useEffect(() => {
    const desktop = getInboxZeroDesktopApp();
    if (!desktop?.setUnreadCount) return;
    const ids: string[] = JSON.parse(accountIds);
    const counts = new Map<string, number>();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let running = false;

    async function refresh() {
      if (running || controller.signal.aborted) return;
      clearTimeout(timer);
      running = true;
      try {
        // Bound provider traffic for users with many connected accounts.
        for (const id of ids) {
          if (controller.signal.aborted) return;
          try {
            const response = await fetch("/api/labels/counts", {
              headers: { [EMAIL_ACCOUNT_HEADER]: id },
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(20_000),
              ]),
            });
            if (response.status === 401 || response.status === 403) {
              counts.delete(id);
              continue;
            }
            if (!response.ok) continue;
            const result: LabelCountsResponse = await response.json();
            const inbox = result.counts.find((count) => count.id === "INBOX");
            if (
              inbox &&
              Number.isSafeInteger(inbox.unread) &&
              inbox.unread >= 0
            ) {
              counts.set(id, inbox.unread);
            }
          } catch {
            // Preserve the last successful count through temporary network failures.
          }
        }
        if (!controller.signal.aborted) {
          desktop?.setUnreadCount?.(
            [...counts.values()].reduce((sum, count) => sum + count, 0),
          );
        }
      } finally {
        running = false;
        if (!controller.signal.aborted) timer = setTimeout(refresh, 60_000);
      }
    }

    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("online", refresh);
    return () => {
      controller.abort();
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("online", refresh);
      desktop.setUnreadCount?.(0);
    };
  }, [accountIds]);

  return null;
}
