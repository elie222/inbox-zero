import { publishToQstashQueue } from "@/utils/upstash";
import { env } from "@/env";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("upstash/deep-clean");

const DEEP_CLEAN_CATEGORIZATION_PREFIX = "deep-clean-categorization";

const getDeepCleanQueueName = ({
  emailAccountId,
}: {
  emailAccountId: string;
}) => `${DEEP_CLEAN_CATEGORIZATION_PREFIX}-${emailAccountId}`;

/**
 * Triggers DeepClean categorization for a user's top senders
 * This should be called 2-5 minutes after user signup
 */
export async function triggerDeepCleanCategorization({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const url = `${env.WEBHOOK_URL || env.NEXT_PUBLIC_BASE_URL}/api/user/deep-clean/categorize`;

  const queueName = getDeepCleanQueueName({ emailAccountId });

  logger.info("Triggering DeepClean categorization", {
    emailAccountId,
    url,
    queueName,
  });

  await publishToQstashQueue({
    queueName,
    parallelism: 1, // Only one job per user
    url,
    body: {
      emailAccountId,
    },
    // Note: delay param not currently supported, consider using QStash schedule API if needed
  });
}

/**
 * Gets the top senders by email count for DeepClean categorization
 * Returns senders that haven't been categorized yet
 * Filters out senders with very few emails (likely personal contacts)
 */
export async function getTopSendersForDeepClean({
  emailAccountId,
  limit = 100,
  minEmailCount = 3,
}: {
  emailAccountId: string;
  limit?: number;
  minEmailCount?: number; // Minimum number of emails from a sender to categorize them
}) {
  // Get top senders by email count from EmailMessage table
  const topSenders = await prisma.emailMessage.groupBy({
    by: ["from"],
    where: {
      emailAccountId,
      inbox: true, // Only count inbox emails
    },
    _count: {
      from: true,
    },
    orderBy: {
      _count: {
        from: "desc",
      },
    },
    take: limit * 3, // Get more to account for already categorized ones and filtered low-count senders
  });

  // Filter out senders that are already categorized
  const categorizedSenders = await prisma.newsletter.findMany({
    where: {
      emailAccountId,
      categoryId: { not: null },
    },
    select: { email: true },
  });

  const categorizedEmails = new Set(categorizedSenders.map((s) => s.email));

  // Filter for senders with enough emails and not yet categorized
  // This helps avoid categorizing personal contacts with just 1-2 emails
  const uncategorizedSenders = topSenders
    .filter((sender) => sender._count.from >= minEmailCount) // Only include senders with minimum email count
    .map((sender) => sender.from)
    .filter((email) => !categorizedEmails.has(email))
    .slice(0, limit);

  logger.info("Found top senders for DeepClean", {
    emailAccountId,
    totalFound: topSenders.length,
    uncategorizedCount: uncategorizedSenders.length,
    filteredByMinCount: topSenders.filter((s) => s._count.from < minEmailCount)
      .length,
    requestedLimit: limit,
    minEmailCount,
  });

  return uncategorizedSenders;
}
