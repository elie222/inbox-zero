import { differenceInDays } from "date-fns/differenceInDays";
import { format } from "date-fns/format";

export const DEFAULT_SHARE_LINK = "https://www.getinboxzero.com";

export function buildShareText({
  senderCount,
  link,
}: {
  senderCount: number;
  link: string;
}): string {
  const lists = senderCount === 1 ? "email list" : "email lists";
  return `I just unsubscribed from ${senderCount} ${lists} with Inbox Zero. ${link}`;
}

export function buildXShareUrl(params: {
  senderCount: number;
  link: string;
}): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(buildShareText(params))}`;
}

export function buildLinkedInShareUrl(params: {
  senderCount: number;
  link: string;
}): string {
  return `https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(buildShareText(params))}`;
}

export function buildCelebrationSubline({
  emailCount,
  dateRange,
}: {
  emailCount: number;
  dateRange?: { from?: Date; to?: Date };
}): string {
  const emails = `${emailCount.toLocaleString("en-US")} ${emailCount === 1 ? "email" : "emails"}`;
  const phrase = getDateRangePhrase(dateRange);
  return phrase
    ? `That's ${emails} ${phrase} you won't get again.`
    : `That's ${emails} you won't get again.`;
}

function getDateRangePhrase(dateRange?: {
  from?: Date;
  to?: Date;
}): string | null {
  if (!dateRange?.from || !dateRange?.to) return null;
  const days = differenceInDays(dateRange.to, dateRange.from);
  if (days === 7) return "over the last week";
  if (days === 30) return "over the last month";
  if (days === 90) return "over the last 3 months";
  if (days === 365) return "over the last year";
  return `since ${format(dateRange.from, "MMM d, yyyy")}`;
}
