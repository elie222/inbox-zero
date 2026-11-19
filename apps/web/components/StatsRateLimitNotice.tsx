"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { cn } from "@/utils";

export function StatsRateLimitNotice({ className }: { className?: string }) {
  const { i18n } = useLingui();
  const { rateLimitResumeAt } = useStatLoader();

  if (!rateLimitResumeAt) return null;

  return (
    <div
      role="status"
      className={cn(
        "rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
        className,
      )}
    >
      <Trans>
        Your email provider is limiting requests, so loading your emails is
        paused. It will continue automatically around{" "}
        {rateLimitResumeAt.toLocaleTimeString(i18n.locale)}.
      </Trans>
    </div>
  );
}
