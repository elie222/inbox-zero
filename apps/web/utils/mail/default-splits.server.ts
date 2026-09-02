import { randomUUID } from "node:crypto";
import { MailSplitKind } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { getDefaultMailSplitDrafts } from "@/utils/mail/default-splits";
import { lockMailSplits } from "@/utils/mail/split-lock";
import { MAX_MAIL_SPLITS } from "@/utils/mail/split-constants";
import { STANDARD_CATEGORY_SYSTEM_TYPES } from "@/utils/rule/consts";

type DefaultMailSplit = ReturnType<typeof getDefaultMailSplitDrafts>[number];

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

export async function setDefaultMailSplits({
  emailAccountId,
  defaultSplits,
  enabled,
}: {
  emailAccountId: string;
  defaultSplits: DefaultMailSplit[];
  enabled: boolean;
}) {
  if (defaultSplits.length === 0) return;

  if (!enabled) {
    await prisma.$transaction([
      lockMailSplits(emailAccountId),
      prisma.mailSplit.deleteMany({
        where: {
          emailAccountId,
          kind: MailSplitKind.LABEL,
          value: { in: defaultSplits.map((split) => split.value) },
        },
      }),
    ]);
    return;
  }

  const rows = defaultSplits.map((split, order) => ({
    id: randomUUID(),
    ...split,
    order,
  }));

  await prisma.$transaction([
    lockMailSplits(emailAccountId),
    prisma.$executeRaw`
      WITH split_state AS (
        SELECT
          COUNT(*)::integer AS count,
          COALESCE(MAX("order"), -1)::integer + 1 AS next_order
        FROM "MailSplit"
        WHERE "emailAccountId" = ${emailAccountId}
      ),
      missing_defaults AS (
        SELECT
          defaults.*,
          (ROW_NUMBER() OVER (ORDER BY defaults."order") - 1)::integer AS offset
        FROM jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) AS defaults(
          "id" text,
          "name" text,
          "kind" text,
          "value" text,
          "order" integer
        )
        WHERE NOT EXISTS (
          SELECT 1
          FROM "MailSplit" AS existing
          WHERE existing."emailAccountId" = ${emailAccountId}
            AND (
              existing."name" = defaults."name"
              OR (
                existing."kind" = 'LABEL'::"MailSplitKind"
                AND existing."value" = defaults."value"
              )
            )
        )
        ORDER BY defaults."order"
        LIMIT (
          SELECT GREATEST(${MAX_MAIL_SPLITS} - split_state.count, 0)
          FROM split_state
        )
      )
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
        missing_defaults."id",
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP,
        missing_defaults."name",
        missing_defaults."kind"::"MailSplitKind",
        missing_defaults."value",
        split_state.next_order + missing_defaults.offset,
        ${emailAccountId}
      FROM missing_defaults
      CROSS JOIN split_state
      ON CONFLICT DO NOTHING
    `,
  ]);
}
