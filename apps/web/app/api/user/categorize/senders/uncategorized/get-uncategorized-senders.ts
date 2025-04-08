import { extractEmailAddress } from "@/utils/email";
import { getSenders } from "./get-senders";
import prisma from "@/utils/prisma";

const MAX_ITERATIONS = 200;

export async function getUncategorizedSenders({
  userId,
  offset = 0,
  limit = 100,
}: {
  userId: string;
  offset?: number;
  limit?: number;
}) {
  let uncategorizedSenders: string[] = [];
  let currentOffset = offset;

  while (uncategorizedSenders.length === 0 && currentOffset < MAX_ITERATIONS) {
    const result = await getSenders({
      userId,
      limit,
      offset: currentOffset,
    });
    const allSenders = result.map((sender) => extractEmailAddress(sender.from));

    const existingSenders = await prisma.newsletter.findMany({
      where: {
        email: { in: allSenders },
        userId,
        category: { isNot: null },
      },
      select: { email: true },
    });

    const existingSenderEmails = new Set(existingSenders.map((s) => s.email));

    uncategorizedSenders = allSenders.filter(
      (email) => !existingSenderEmails.has(email),
    );

    // Break the loop if no more senders are available
    if (allSenders.length < limit) {
      return { uncategorizedSenders };
    }

    currentOffset += limit;
  }

  return {
    uncategorizedSenders,
    nextOffset: currentOffset, // Only return nextOffset if there might be more
  };
}
