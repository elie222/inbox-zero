import type { EmailProvider, EmailFilter } from "@/utils/email/types";
import { extractEmailAddress } from "@/utils/email";
import prisma from "@/utils/prisma";
import { NewsletterStatus } from "@prisma/client";
import { GmailLabel } from "@/utils/gmail/label";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("newsletter-helpers");

export async function getAutoArchiveFilters(emailProvider: EmailProvider) {
  try {
    const filters = await emailProvider.getFiltersList();

    const autoArchiveFilters = filters.filter((filter) =>
      isAutoArchiveFilter(filter, emailProvider),
    );

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
  emailProvider: EmailProvider,
) {
  return autoArchiveFilters.find((filter) => {
    const from = extractEmailAddress(fromEmail);
    return (
      filter.criteria?.from?.toLowerCase().includes(from.toLowerCase()) &&
      isAutoArchiveFilter(filter, emailProvider)
    );
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

function isAutoArchiveFilter(filter: EmailFilter, provider: EmailProvider) {
  switch (provider.name) {
    case "google":
      return isGmailAutoArchiveFilter(filter);
    case "microsoft-entra-id":
      return isOutlookAutoArchiveFilter(filter);
    default:
      return false;
  }
}

function isGmailAutoArchiveFilter(filter: EmailFilter): boolean {
  // For Gmail: check if it removes INBOX label or adds TRASH label
  return Boolean(
    filter.action?.removeLabelIds?.includes(GmailLabel.INBOX) ||
      filter.action?.addLabelIds?.includes(GmailLabel.TRASH),
  );
}

function isOutlookAutoArchiveFilter(filter: EmailFilter): boolean {
  // For Outlook: check if it moves to archive folder (removeLabelIds contains "INBOX")
  return Boolean(filter.action?.removeLabelIds?.includes("INBOX"));
}
