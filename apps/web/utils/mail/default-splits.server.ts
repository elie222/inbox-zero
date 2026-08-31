import { randomUUID } from "node:crypto";
import prisma from "@/utils/prisma";
import { getDefaultMailSplitDrafts } from "@/utils/mail/default-splits";
import { lockMailSplits } from "@/utils/mail/split-lock";

export async function seedDefaultMailSplits({
  emailAccountId,
  rules,
}: {
  emailAccountId: string;
  rules: Parameters<typeof getDefaultMailSplitDrafts>[0];
}) {
  const defaultSplits = getDefaultMailSplitDrafts(rules);
  if (defaultSplits.length === 0) return;

  const rows = defaultSplits.map((split, order) => ({
    id: randomUUID(),
    ...split,
    order,
  }));

  await prisma.$transaction([
    lockMailSplits(emailAccountId),
    prisma.$executeRaw`
      INSERT INTO "MailSplit" (
        "id",
        "createdAt",
        "updatedAt",
        "name",
        "kind",
        "value",
        "order",
        "emailAccountId"
      )
      SELECT
        defaults."id",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        defaults."name",
        defaults."kind"::"MailSplitKind",
        defaults."value",
        defaults."order",
        ${emailAccountId}
      FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS defaults(
        "id" text,
        "name" text,
        "kind" text,
        "value" text,
        "order" integer
      )
      WHERE NOT EXISTS (
        SELECT 1
        FROM "MailSplit"
        WHERE "emailAccountId" = ${emailAccountId}
      )
      ON CONFLICT DO NOTHING
    `,
  ]);
}
