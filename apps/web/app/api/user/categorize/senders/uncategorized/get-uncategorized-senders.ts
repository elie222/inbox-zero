import { extractEmailAddress } from "@/utils/email";
import { getSenders } from "./get-senders";
import prisma from "@/utils/prisma";

const MAX_ITERATIONS = 200;

export type UncategorizedSender = {
  email: string;
  name: string | null;
};

export async function getUncategorizedSenders({
  emailAccountId,
  offset = 0,
  limit = 100,
}: {
  emailAccountId: string;
  offset?: number;
  limit?: number;
}) {
  let uncategorizedSenders: UncategorizedSender[] = [];
  let currentOffset = offset;

  while (uncategorizedSenders.length === 0 && currentOffset < MAX_ITERATIONS) {
    const result = await getSenders({
      emailAccountId,
      limit,
      offset: currentOffset,
    });

    // Build a map of email -> name for lookup
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

    // Break the loop if no more senders are available
    if (allSenderEmails.length < limit) {
      return { uncategorizedSenders };
    }

    currentOffset += limit;
  }

  return {
    uncategorizedSenders,
    nextOffset: currentOffset, // Only return nextOffset if there might be more
  };
}
