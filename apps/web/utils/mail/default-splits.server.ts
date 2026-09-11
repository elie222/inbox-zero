import { MailSplitFilterKind } from "@/generated/prisma/enums";
import { MAX_MAIL_SPLITS } from "@/utils/mail/split-constants";
import { randomUUID } from "node:crypto";
import prisma from "@/utils/prisma";
import { getDefaultMailSplitDrafts } from "@/utils/mail/default-splits";
import { lockMailSplits } from "@/utils/mail/split-lock";
import { STANDARD_CATEGORY_SYSTEM_TYPES } from "@/utils/rule/consts";

export async function getDefaultMailSplitDraftsForAccount(
  emailAccountId: string,
) {
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      enabled: true,
      systemType: { in: [...STANDARD_CATEGORY_SYSTEM_TYPES] },
    },
    select: {
      systemType: true,
      actions: { select: { type: true, labelId: true } },
    },
  });

  return getDefaultMailSplitDrafts(rules);
}

export async function setDefaultMailSplits({
  emailAccountId,
  defaultSplits,
  enabled,
}: {
  emailAccountId: string;
  defaultSplits: ReturnType<typeof getDefaultMailSplitDrafts>;
  enabled: boolean;
}) {
  if (!defaultSplits.length) return { status: "success" as const };
  if (!enabled) {
    await prisma.$transaction([
      lockMailSplits(emailAccountId),
      prisma.mailSplit.deleteMany({
        where: {
          emailAccountId,
          OR: defaultSplits.map((split) => ({
            filters: {
              some: {},
              every: { kind: MailSplitFilterKind.LABEL, value: split.labelId },
            },
          })),
        },
      }),
    ]);
    return { status: "success" as const };
  }
  const rows = defaultSplits.map((split, order) => ({
    ...split,
    id: randomUUID(),
    order,
  }));
  const [, results] = await prisma.$transaction([
    lockMailSplits(emailAccountId),
    prisma.$queryRaw<Array<{ missingCount: number; availableCount: number }>>`
      WITH existing AS (
        SELECT COUNT(*)::integer AS count, COALESCE(MAX("order"), -1)::integer + 1 AS next_order
        FROM "MailSplit" WHERE "emailAccountId" = ${emailAccountId}
      ), missing AS (
        SELECT defaults.*, ROW_NUMBER() OVER (ORDER BY defaults."order") - 1 AS offset
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb)
          AS defaults("id" text, "name" text, "labelId" text, "order" integer)
        WHERE NOT EXISTS (
          SELECT 1 FROM "MailSplit" split WHERE split."emailAccountId" = ${emailAccountId}
          AND (split."name" = defaults."name" OR (
            EXISTS (SELECT 1 FROM "MailSplitFilter" filter WHERE filter."mailSplitId" = split."id" AND filter."kind" = 'LABEL' AND filter."value" = defaults."labelId")
            AND NOT EXISTS (SELECT 1 FROM "MailSplitFilter" filter WHERE filter."mailSplitId" = split."id" AND (filter."kind" <> 'LABEL' OR filter."value" IS DISTINCT FROM defaults."labelId"))
          ))
        )
      ), inserted AS (
        INSERT INTO "MailSplit" ("id", "createdAt", "updatedAt", "name", "matchAll", "order", "emailAccountId")
        SELECT missing."id", NOW(), NOW(), missing."name", true, existing.next_order + missing.offset, ${emailAccountId}
        FROM missing CROSS JOIN existing
        WHERE (SELECT COUNT(*) FROM missing) <= GREATEST(${MAX_MAIL_SPLITS} - existing.count, 0)
        ON CONFLICT DO NOTHING RETURNING "id"
      ), inserted_filters AS (
      INSERT INTO "MailSplitFilter" ("id", "kind", "value", "order", "mailSplitId")
      SELECT missing."id" || '-filter', 'LABEL'::"MailSplitFilterKind", missing."labelId", 0, missing."id"
      FROM missing JOIN inserted ON inserted."id" = missing."id"
      RETURNING "id"
      )
      SELECT (SELECT COUNT(*)::integer FROM missing) AS "missingCount",
        GREATEST(${MAX_MAIL_SPLITS} - existing.count, 0)::integer AS "availableCount"
      FROM existing
    `,
  ]);
  const result = results[0];
  return {
    status:
      result && result.missingCount > result.availableCount
        ? ("limit" as const)
        : ("success" as const),
  };
}
