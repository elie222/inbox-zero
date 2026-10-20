import prisma from "@/utils/prisma";
import type { SenderMessageCounts } from "@/utils/bulk-archive/category-stats";

type SenderMessageCountsRow = SenderMessageCounts & { sender: string };

/**
 * Counts stored messages per categorized sender, keyed by lowercase address.
 * Reads only our own EmailMessage rows, so it makes no provider calls.
 */
export async function getSenderMessageCounts({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const rows = await prisma.$queryRaw<SenderMessageCountsRow[]>`
    SELECT
      LOWER(n."email") AS "sender",
      COUNT(*) FILTER (WHERE m."inbox")::int AS "inbox",
      COUNT(*) FILTER (WHERE m."inbox" AND NOT m."read")::int AS "unread",
      COUNT(*) FILTER (WHERE m."read")::int AS "read",
      COUNT(*)::int AS "total"
    FROM "Newsletter" n
    JOIN "EmailMessage" m
      ON m."emailAccountId" = n."emailAccountId"
      AND LOWER(m."from") = LOWER(n."email")
    WHERE n."emailAccountId" = ${emailAccountId}
      AND n."categoryId" IS NOT NULL
    GROUP BY LOWER(n."email")
  `;

  return new Map(
    rows.map(({ sender, ...counts }) => [sender, counts] as const),
  );
}
