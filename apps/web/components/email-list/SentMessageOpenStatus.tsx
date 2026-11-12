"use client";

import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { CheckCheckIcon } from "lucide-react";
import { formatDistanceToNow } from "date-fns/formatDistanceToNow";
import { Tooltip } from "@/components/Tooltip";
import { cn } from "@/utils";
import { getDateFnsLocale } from "@/utils/i18n/date-fns-locale";

export type SentMessageOpenState = {
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
};

export function SentMessageOpenStatus({
  compact = false,
  open,
}: {
  compact?: boolean;
  open: SentMessageOpenState;
}) {
  const { i18n } = useLingui();
  const detail = describeSentMessageOpen(open, i18n);
  const opened = Boolean(open.firstOpenedAt);

  if (compact && !opened) return null;

  return (
    <Tooltip content={detail}>
      <span
        className={cn(
          "inline-flex shrink-0 items-center",
          opened
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground",
        )}
      >
        <CheckCheckIcon aria-hidden className="size-3.5" />
        <span className="sr-only">{detail}</span>
      </span>
    </Tooltip>
  );
}

function describeSentMessageOpen(open: SentMessageOpenState, i18n: I18n) {
  const firstOpenedAt = parseDate(open.firstOpenedAt);
  if (!firstOpenedAt) return i18n._(msg`Not opened yet`);

  const formatRelative = (date: Date) =>
    formatDistanceToNow(date, {
      addSuffix: true,
      locale: getDateFnsLocale(i18n.locale),
    });

  if (open.openCount > 1) {
    const lastOpened = formatRelative(
      parseDate(open.lastOpenedAt) ?? firstOpenedAt,
    );
    return i18n._(
      msg`${plural(open.openCount, {
        one: `Opened # time · Last opened ${lastOpened}`,
        other: `Opened # times · Last opened ${lastOpened}`,
      })}`,
    );
  }

  const firstOpened = formatRelative(firstOpenedAt);
  return i18n._(msg`Opened ${firstOpened}`);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
