import type { EmailProvider, EmailFilter } from "@/utils/email/provider";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { NewsletterStatus } from "@prisma/client";
import { GmailLabel } from "@/utils/gmail/label";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("newsletter-helpers");

export async function getAutoArchiveFilters(emailProvider: EmailProvider) {
  try {
    const filters = await emailProvider.getFiltersList();

    const autoArchiveFilters = filters.filter(isAutoArchiveFilter);

    return autoArchiveFilters;
  } catch (error) {
    logger.error("Error getting auto-archive filters", { error });
    // Return empty array instead of throwing, so the newsletter stats still work
    return [];
  }
}

export function findAutoArchiveFilter(
  autoArchiveFilters: EmailFilter[],
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
    autoArchived?: EmailFilter;
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

function isAutoArchiveFilter(filter: EmailFilter) {
  // For Gmail: check if it removes INBOX label or adds TRASH label
  const isGmailArchive =
    filter.action?.removeLabelIds?.includes(GmailLabel.INBOX) ||
    filter.action?.addLabelIds?.includes(GmailLabel.TRASH);

  // For Outlook: check if it moves to archive folder (removeLabelIds contains "INBOX")
  const isOutlookArchive = filter.action?.removeLabelIds?.includes("INBOX");

  const result = isGmailArchive || isOutlookArchive;

  logger.info("Checking if filter is auto-archive", {
    filterId: filter.id,
    filterAction: filter.action,
    isGmailArchive,
    isOutlookArchive,
    result,
  });

  return result;
}
