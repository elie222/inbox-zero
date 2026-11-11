import type { I18n } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { differenceInDays } from "date-fns/differenceInDays";

type ShareParams = {
  senderCount: number;
  link: string;
  yearlyEmails?: number | null;
  i18n: I18n;
};

export function buildShareText({
  senderCount,
  link,
  yearlyEmails,
  i18n,
}: ShareParams): string {
  if (yearlyEmails != null) {
    const yearly = yearlyEmails.toLocaleString("en-US");
    return i18n._(
      msg`I just unsubscribed from ${plural(senderCount, {
        one: "# email list",
        other: "# email lists",
      })} with Inbox Zero — that's ~${yearly} fewer emails a year. ${link}`,
    );
  }
  return i18n._(
    msg`I just unsubscribed from ${plural(senderCount, {
      one: "# email list",
      other: "# email lists",
    })} with Inbox Zero. ${link}`,
  );
}

export function buildXShareUrl(params: ShareParams): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(buildShareText(params))}`;
}

export function buildLinkedInShareUrl(params: ShareParams): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(buildShareText(params))}`;
}

// Projects how many emails these senders would have sent over a year, based on
// how often they emailed during the selected range. This future saving is the
// real win, not the handful of emails from the past few months.
export function projectYearlyEmails({
  emailCount,
  dateRange,
}: {
  emailCount: number;
  dateRange?: { from?: Date; to?: Date };
}): number | null {
  if (emailCount <= 0) return null;
  if (!dateRange?.from || !dateRange?.to) return null;
  const days = differenceInDays(dateRange.to, dateRange.from);
  if (days <= 0) return null;
  return roundEstimate((emailCount * 365) / days);
}

export function buildCelebrationSubline({
  emailCount,
  dateRange,
  i18n,
}: {
  emailCount: number;
  dateRange?: { from?: Date; to?: Date };
  i18n: I18n;
}): string {
  const yearlyEmails = projectYearlyEmails({ emailCount, dateRange });
  if (yearlyEmails != null) {
    return i18n._(
      msg`At their current pace, that's about ${plural(yearlyEmails, {
        one: "# fewer email",
        other: "# fewer emails",
      })} a year.`,
    );
  }
  if (emailCount > 0) {
    return i18n._(
      msg`That's ${plural(emailCount, {
        one: "# email",
        other: "# emails",
      })} you won't get again.`,
    );
  }
  return i18n._(msg`Those senders won't reach your inbox again.`);
}

function roundEstimate(value: number): number {
  if (value >= 1000) return Math.round(value / 100) * 100;
  if (value >= 100) return Math.round(value / 10) * 10;
  return Math.round(value);
}
