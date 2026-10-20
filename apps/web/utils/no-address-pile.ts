import { Prisma } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";

type NoAddressPileName = {
  /** Display name as sent; "" when the message had none. */
  name: string;
  count: number;
  threads: { threadId: string; messageIds: string[] }[];
};

/**
 * Mail with no sender address can't be blocked by address, so it is grouped
 * by display name. Any thread the user sent a message in is left out: that is
 * a conversation they took part in, whatever the From line says.
 */
export function excludeRepliedThreads(emailAccountId: string) {
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "EmailMessage" "reply"
    WHERE "reply"."emailAccountId" = ${emailAccountId}
      AND "reply"."threadId" = "EmailMessage"."threadId"
      AND "reply"."sent" = true
  )`;
}

export async function getNoAddressPile({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const rows = await prisma.$queryRaw<
    { name: string; threadId: string; messageId: string }[]
  >(Prisma.sql`
    SELECT COALESCE(NULLIF(TRIM("fromName"), ''), '') AS "name", "threadId", "messageId"
    FROM "EmailMessage"
    WHERE "emailAccountId" = ${emailAccountId}
      AND "from" = ''
      AND "sent" = false
      AND "draft" = false
      AND ${excludeRepliedThreads(emailAccountId)}
    ORDER BY "date" DESC
  `);

  const byName = new Map<
    string,
    { count: number; threads: Map<string, string[]> }
  >();
  for (const row of rows) {
    const group = byName.get(row.name) ?? { count: 0, threads: new Map() };
    group.count += 1;
    group.threads.set(row.threadId, [
      ...(group.threads.get(row.threadId) ?? []),
      row.messageId,
    ]);
    byName.set(row.name, group);
  }

  const names: NoAddressPileName[] = [...byName.entries()]
    .map(([name, group]) => ({
      name,
      count: group.count,
      threads: [...group.threads.entries()].map(([threadId, messageIds]) => ({
        threadId,
        messageIds,
      })),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return { names, total: rows.length };
}
