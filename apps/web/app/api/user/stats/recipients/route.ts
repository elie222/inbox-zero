import { NextResponse } from "next/server";
import { z } from "zod";
import countBy from "lodash/countBy";
import sortBy from "lodash/sortBy";
import type { gmail_v1 } from "@googleapis/gmail";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import { parseMessage } from "@/utils/mail";
import { getMessage, getMessages } from "@/utils/gmail/message";
import { zodPeriod } from "@inboxzero/tinybird";
import { extractDomainFromEmail } from "@/utils/email";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";

const recipientStatsQuery = z.object({
  period: zodPeriod,
  fromDate: z.coerce.number().nullish(),
  toDate: z.coerce.number().nullish(),
});
export type RecipientStatsQuery = z.infer<typeof recipientStatsQuery>;
export type RecipientsResponse = Awaited<ReturnType<typeof getRecipients>>;

async function getRecipients({ gmail }: { gmail: gmail_v1.Gmail }) {
  const res = await getMessages(gmail, {
    query: "in:sent",
    maxResults: 50,
  });

  // be careful of rate limiting here
  const messages = await Promise.all(
    res.messages?.map(async (m) => {
      const message = await getMessage(m.id!, gmail);
      return parseMessage(message);
    }) || [],
  );

  const countByRecipient = countBy(messages, (m) => m.headers.to);
  const countByDomain = countBy(messages, (m) =>
    extractDomainFromEmail(m.headers.to),
  );

  const mostActiveRecipientEmails = sortBy(
    Object.entries(countByRecipient),
    ([, count]) => -count,
  ).map(([recipient, count]) => ({
    name: recipient,
    value: count,
  }));

  const mostActiveRecipientDomains = sortBy(
    Object.entries(countByDomain),
    ([, count]) => -count,
  ).map(([recipient, count]) => ({
    name: recipient,
    value: count,
  }));

  return { mostActiveRecipientEmails, mostActiveRecipientDomains };
}

async function getRecipientsTinybird(
  options: RecipientStatsQuery & { userId: string },
): Promise<RecipientsResponse> {
  const [mostReceived, mostReceivedDomains] = await Promise.all([
    getMostSentTo(options),
    getDomainsMostSentTo(options),
  ]);

  return {
    mostActiveRecipientEmails: mostReceived.data.map(
      (d: { to: string; count: number }) => ({
        name: d.to,
        value: d.count,
      }),
    ),
    mostActiveRecipientDomains: mostReceivedDomains.data.map(
      (d: { to: string; count: number }) => ({
        name: d.to,
        value: d.count,
      }),
    ),
  };
}

async function getRecipientStats({
  userId,
  fromDate,
  toDate,
  field,
}: {
  userId: string;
  fromDate?: number | null;
  toDate?: number | null;
  field: "to" | "toDomain";
}) {
  const recipientsCount = await prisma.emailMessage.groupBy({
    by: [field],
    where: {
      userId,
      sent: true,
      date:
        fromDate || toDate
          ? {
              gte: fromDate ? new Date(fromDate) : undefined,
              lte: toDate ? new Date(toDate) : undefined,
            }
          : undefined,
    },
    _count: {
      [field]: true,
    },
    orderBy: {
      _count: {
        [field]: "desc",
      },
    },
    take: 50,
  });

  return {
    data: recipientsCount.map((item) => ({
      to: item[field] || "",
      count: item._count[field],
    })),
  };
}

/**
 * Get most sent to recipients by email address
 */
async function getMostSentTo({
  userId,
  period, // Kept for API compatibility
  fromDate,
  toDate,
}: RecipientStatsQuery & {
  userId: string;
}) {
  return getRecipientStats({
    userId,
    fromDate,
    toDate,
    field: "to",
  });
}

/**
 * Get most sent to recipients by domain
 */
async function getDomainsMostSentTo({
  userId,
  period, // Kept for API compatibility
  fromDate,
  toDate,
}: RecipientStatsQuery & {
  userId: string;
}) {
  return getRecipientStats({
    userId,
    fromDate,
    toDate,
    field: "toDomain",
  });
}

export const GET = withError(async (request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const { searchParams } = new URL(request.url);
  const query = recipientStatsQuery.parse({
    period: searchParams.get("period") || "week",
    fromDate: searchParams.get("fromDate"),
    toDate: searchParams.get("toDate"),
  });

  const result = await getRecipientsTinybird({
    ...query,
    userId: session.user.id,
  });

  return NextResponse.json(result);
});
