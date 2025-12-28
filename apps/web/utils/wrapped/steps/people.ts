import prisma from "@/utils/prisma";
import type { PeopleStats, TopContact } from "../types";

export async function computePeopleStats(
  emailAccountId: string,
  year: number,
): Promise<PeopleStats> {
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year + 1, 0, 1);

  // Get top contacts from received emails (people who email us most)
  const topSenders = await prisma.emailMessage.groupBy({
    by: ["from", "fromName"],
    where: {
      emailAccountId,
      date: { gte: startDate, lt: endDate },
      sent: false,
      draft: false,
    },
    _count: { from: true },
    orderBy: { _count: { from: "desc" } },
    take: 10,
  });

  // Get top recipients (people we email most)
  const topRecipients = await prisma.emailMessage.groupBy({
    by: ["to"],
    where: {
      emailAccountId,
      date: { gte: startDate, lt: endDate },
      sent: true,
      draft: false,
    },
    _count: { to: true },
    orderBy: { _count: { to: "desc" } },
    take: 10,
  });

  // Combine and score contacts
  const contactScores = new Map<
    string,
    { email: string; name: string | null; count: number }
  >();

  for (const sender of topSenders) {
    const existing = contactScores.get(sender.from);
    if (existing) {
      existing.count += sender._count.from;
      if (sender.fromName && !existing.name) {
        existing.name = sender.fromName;
      }
    } else {
      contactScores.set(sender.from, {
        email: sender.from,
        name: sender.fromName,
        count: sender._count.from,
      });
    }
  }

  for (const recipient of topRecipients) {
    const existing = contactScores.get(recipient.to);
    if (existing) {
      existing.count += recipient._count.to;
    } else {
      contactScores.set(recipient.to, {
        email: recipient.to,
        name: null,
        count: recipient._count.to,
      });
    }
  }

  // Get top 5 contacts
  const topContacts: TopContact[] = Array.from(contactScores.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Count unique senders and recipients
  const [uniqueSendersResult, uniqueRecipientsResult] = await Promise.all([
    prisma.emailMessage.groupBy({
      by: ["from"],
      where: {
        emailAccountId,
        date: { gte: startDate, lt: endDate },
        sent: false,
        draft: false,
      },
    }),
    prisma.emailMessage.groupBy({
      by: ["to"],
      where: {
        emailAccountId,
        date: { gte: startDate, lt: endDate },
        sent: true,
        draft: false,
      },
    }),
  ]);

  return {
    topContacts,
    uniqueSenders: uniqueSendersResult.length,
    uniqueRecipients: uniqueRecipientsResult.length,
  };
}
