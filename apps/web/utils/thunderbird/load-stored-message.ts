import prisma from "@/utils/prisma";
import type { ParsedMessage } from "@/utils/types";
import { extractEmailAddress } from "@/utils/email";

type ReviewRow = {
  messageId: string;
  threadId: string;
  subject: string;
  from: string;
  to: string | null;
  snippet: string | null;
  textPlain: string | null;
  messageDate: Date | null;
  thunderbirdMessageId: number | null;
  thunderbirdAccountId: string | null;
};

type EmailMessageRow = {
  messageId: string;
  threadId: string;
  from: string;
  fromName: string | null;
  to: string;
  date: Date;
  read: boolean;
  sent: boolean;
  inbox: boolean;
};

export function reviewItemToParsedMessage(row: ReviewRow): ParsedMessage {
  const date = row.messageDate || new Date();
  return {
    id: row.messageId,
    threadId: row.threadId,
    historyId: row.thunderbirdMessageId
      ? String(row.thunderbirdMessageId)
      : row.messageId,
    subject: row.subject || "(no subject)",
    snippet: row.snippet || (row.textPlain || "").slice(0, 200),
    textPlain: row.textPlain || undefined,
    textHtml: undefined,
    date,
    headers: {
      from: row.from,
      to: row.to || "",
      subject: row.subject || "",
      date: date.toISOString(),
    },
    labelIds: [],
    attachments: [],
    inline: [],
  };
}

export function emailMessageToParsedMessage(row: EmailMessageRow): ParsedMessage {
  const from =
    row.fromName && !row.from.includes("<")
      ? `${row.fromName} <${row.from}>`
      : row.from;
  return {
    id: row.messageId,
    threadId: row.threadId,
    historyId: row.messageId,
    subject: "",
    snippet: "",
    date: row.date,
    headers: {
      from,
      to: row.to || "",
      subject: "",
      date: row.date.toISOString(),
    },
    labelIds: [
      ...(row.read ? ["READ"] : []),
      ...(row.sent ? ["SENT"] : []),
      ...(row.inbox ? ["INBOX"] : []),
    ],
    attachments: [],
    inline: [],
  };
}

export async function loadThunderbirdStoredMessage({
  emailAccountId,
  messageId,
}: {
  emailAccountId: string;
  messageId: string;
}): Promise<ParsedMessage | null> {
  const review = await prisma.thunderbirdReviewItem.findFirst({
    where: { emailAccountId, messageId },
    orderBy: { createdAt: "desc" },
  });
  if (review) return reviewItemToParsedMessage(review);

  const emailMessage = await prisma.emailMessage.findFirst({
    where: { emailAccountId, messageId },
  });
  if (emailMessage) return emailMessageToParsedMessage(emailMessage);

  return null;
}

export async function searchThunderbirdStoredMessages({
  emailAccountId,
  query,
  maxResults = 20,
}: {
  emailAccountId: string;
  query: string;
  maxResults?: number;
}): Promise<ParsedMessage[]> {
  const q = query.trim();
  if (!q) {
    return listThunderbirdStoredMessages({ emailAccountId, maxResults });
  }

  const reviews = await prisma.thunderbirdReviewItem.findMany({
    where: {
      emailAccountId,
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { from: { contains: q, mode: "insensitive" } },
        { snippet: { contains: q, mode: "insensitive" } },
        { textPlain: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: maxResults,
  });

  if (reviews.length > 0) {
    return dedupeByMessageId(reviews.map(reviewItemToParsedMessage));
  }

  const emails = await prisma.emailMessage.findMany({
    where: {
      emailAccountId,
      OR: [
        { from: { contains: q, mode: "insensitive" } },
        { fromName: { contains: q, mode: "insensitive" } },
        { to: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { date: "desc" },
    take: maxResults,
  });

  return emails.map(emailMessageToParsedMessage);
}

export async function listThunderbirdStoredMessages({
  emailAccountId,
  maxResults = 20,
  after,
  before,
  senderEmail,
}: {
  emailAccountId: string;
  maxResults?: number;
  after?: Date;
  before?: Date;
  senderEmail?: string;
}): Promise<ParsedMessage[]> {
  const reviews = await prisma.thunderbirdReviewItem.findMany({
    where: {
      emailAccountId,
      ...(senderEmail
        ? { from: { contains: senderEmail, mode: "insensitive" } }
        : {}),
      ...(after || before
        ? {
            messageDate: {
              ...(after ? { gte: after } : {}),
              ...(before ? { lte: before } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ messageDate: "desc" }, { createdAt: "desc" }],
    take: maxResults,
  });

  if (reviews.length > 0) {
    return dedupeByMessageId(reviews.map(reviewItemToParsedMessage));
  }

  const emails = await prisma.emailMessage.findMany({
    where: {
      emailAccountId,
      ...(senderEmail
        ? { from: { contains: extractEmailAddress(senderEmail) || senderEmail, mode: "insensitive" } }
        : {}),
      ...(after || before
        ? {
            date: {
              ...(after ? { gte: after } : {}),
              ...(before ? { lte: before } : {}),
            },
          }
        : {}),
    },
    orderBy: { date: "desc" },
    take: maxResults,
  });

  return emails.map(emailMessageToParsedMessage);
}

export async function countThunderbirdStoredMessages(emailAccountId: string) {
  const [reviewCount, emailCount, unreadCount] = await Promise.all([
    prisma.thunderbirdReviewItem.count({ where: { emailAccountId } }),
    prisma.emailMessage.count({ where: { emailAccountId } }),
    prisma.emailMessage.count({
      where: { emailAccountId, read: false, inbox: true },
    }),
  ]);

  return {
    total: Math.max(reviewCount, emailCount),
    unread: unreadCount,
  };
}

function dedupeByMessageId(messages: ParsedMessage[]) {
  const seen = new Set<string>();
  return messages.filter((message) => {
    if (seen.has(message.id)) return false;
    seen.add(message.id);
    return true;
  });
}
