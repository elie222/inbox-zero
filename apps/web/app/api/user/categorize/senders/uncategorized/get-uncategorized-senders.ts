import { extractEmailAddress } from "@/utils/email";
import { getSenders } from "./get-senders";
import prisma from "@/utils/prisma";
import type { Sender } from "@/app/api/user/categorize/senders/batch/handle-batch-validation";

const MAX_ITERATIONS = 200;

export async function getUncategorizedSenders({
  emailAccountId,
  offset = 0,
  limit = 100,
}: {
  emailAccountId: string;
  offset?: number;
  limit?: number;
}) {
  let uncategorizedSenders: Sender[] = [];
  let currentOffset = offset;

  while (uncategorizedSenders.length === 0 && currentOffset < MAX_ITERATIONS) {
    const result = await getSenders({
      emailAccountId,
      limit,
      offset: currentOffset,
    });

    const senderMap = new Map<string, string | null>();
    for (const sender of result) {
      const email = extractEmailAddress(sender.from);
      // Only set the name if we don't already have one (keep first non-null)
      if (!senderMap.has(email) || (!senderMap.get(email) && sender.fromName)) {
        senderMap.set(email, sender.fromName);
      }
    }

    const allSenderEmails = Array.from(senderMap.keys());

    const existingSenders = await prisma.newsletter.findMany({
      where: {
        email: { in: allSenderEmails },
        emailAccountId,
        category: { isNot: null },
      },
      select: { email: true },
    });

    const existingSenderEmails = new Set(existingSenders.map((s) => s.email));

    uncategorizedSenders = allSenderEmails
      .filter((email) => !existingSenderEmails.has(email))
      .map((email) => ({ email, name: senderMap.get(email) ?? null }));

    // Use result.length (raw query count) not allSenderEmails.length (de-duplicated count)
    // to correctly detect when there are more pages
    if (result.length < limit) {
      return { uncategorizedSenders };
    }

    currentOffset += limit;
  }

  // Only return nextOffset if we found senders (to avoid infinite loop when MAX_ITERATIONS is hit)
  if (uncategorizedSenders.length > 0) {
    return { uncategorizedSenders, nextOffset: currentOffset };
  }
  return { uncategorizedSenders };
}
