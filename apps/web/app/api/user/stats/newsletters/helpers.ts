import type { gmail_v1 } from "@googleapis/gmail";
import { extractEmailAddress } from "@/utils/email";
import { getFiltersList } from "@/utils/gmail/filter";
import prisma from "@/utils/prisma";
import { NewsletterStatus } from "@prisma/client";
import { GmailLabel } from "@/utils/gmail/label";

export async function getAutoArchiveFilters(gmail: gmail_v1.Gmail) {
  const filters = await getFiltersList({ gmail });
  const autoArchiveFilters = filters.data.filter?.filter(isAutoArchiveFilter);

  return autoArchiveFilters || [];
}

export function findAutoArchiveFilter(
  autoArchiveFilters: gmail_v1.Schema$Filter[],
  fromEmail: string,
) {
  return autoArchiveFilters.find((filter) => {
    const from = extractEmailAddress(fromEmail);
    return filter.criteria?.from?.includes(from) && isAutoArchiveFilter(filter);
  });
}

export async function findNewsletterStatus({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const userNewsletters = await prisma.newsletter.findMany({
    where: { emailAccountId },
    select: { email: true, status: true },
  });
  return userNewsletters;
}

export function filterNewsletters<
  T extends {
    autoArchived?: gmail_v1.Schema$Filter;
    status?: NewsletterStatus | null;
  },
>(
  newsletters: T[],
  filters: ("unhandled" | "autoArchived" | "unsubscribed" | "approved" | "")[],
): T[] {
  const showAutoArchived = filters.includes("autoArchived");
  const showApproved = filters.includes("approved");
  const showUnsubscribed = filters.includes("unsubscribed");
  const showUnhandled = filters.includes("unhandled");

  return newsletters.filter((email) => {
    if (
      showAutoArchived &&
      (email.autoArchived || email.status === NewsletterStatus.AUTO_ARCHIVED)
    )
      return true;
    if (showUnsubscribed && email.status === NewsletterStatus.UNSUBSCRIBED)
      return true;
    if (showApproved && email.status === NewsletterStatus.APPROVED) return true;
    if (showUnhandled && !email.status && !email.autoArchived) return true;

    return false;
  });
}

function isAutoArchiveFilter(filter: gmail_v1.Schema$Filter) {
  return (
    filter.action?.removeLabelIds?.includes(GmailLabel.INBOX) ||
    filter.action?.addLabelIds?.includes(GmailLabel.TRASH)
  );
}
