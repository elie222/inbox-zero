import { randomUUID } from "node:crypto";
import type { MailSplit } from "@/generated/prisma/client";
import { MailSplitKind } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { lockMailSplits } from "@/utils/mail/split-lock";
import { MAX_MAIL_SPLITS } from "@/utils/mail/split-constants";

export type CreateMailSplitResult =
  | ({ status: "created" } & MailSplit)
  | { status: "duplicate" | "limit" };

/**
 * Inserts a split only if the account is under its limit and the name is free,
 * so two concurrent creates can't race past either check.
 */
export async function createMailSplit({
  emailAccountId,
  name,
  kind,
  values,
}: Pick<MailSplit, "emailAccountId" | "name" | "kind" | "values">) {
  const [, results] = await prisma.$transaction([
    lockMailSplits(emailAccountId),
    prisma.$queryRaw<CreateMailSplitResult[]>`
      WITH split_state AS (
        SELECT
          COUNT(*)::integer AS count,
          COALESCE(MAX("order"), -1)::integer + 1 AS next_order,
          EXISTS (
            SELECT 1
            FROM "MailSplit"
            WHERE "emailAccountId" = ${emailAccountId}
              AND "name" = ${name}
          ) AS name_exists
        FROM "MailSplit"
        WHERE "emailAccountId" = ${emailAccountId}
      ),
      inserted AS (
        INSERT INTO "MailSplit" (
          "id",
          "createdAt",
          "updatedAt",
          "name",
          "kind",
          "values",
          "order",
          "emailAccountId"
        )
        SELECT
          ${randomUUID()},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          ${name},
          ${kind}::"MailSplitKind",
          ${values},
          split_state.next_order,
          ${emailAccountId}
        FROM split_state
        WHERE split_state.count < ${MAX_MAIL_SPLITS}
          AND NOT split_state.name_exists
        RETURNING *
      )
      SELECT
        CASE
          WHEN inserted."id" IS NOT NULL THEN 'created'
          WHEN split_state.name_exists THEN 'duplicate'
          ELSE 'limit'
        END AS status,
        inserted.*
      FROM split_state
      LEFT JOIN inserted ON TRUE
    `,
  ]);

  return results[0];
}

/**
 * Keeps splits usable after a label is deleted: wider splits carry on without
 * it, and a split it was the only label of has nothing left to show.
 */
export async function removeLabelFromMailSplits({
  emailAccountId,
  labelId,
}: {
  emailAccountId: string;
  labelId: string;
}) {
  await prisma.$transaction([
    prisma.$executeRaw`
      UPDATE "MailSplit"
      SET "values" = array_remove("values", ${labelId}),
          "updatedAt" = NOW()
      WHERE "emailAccountId" = ${emailAccountId}
        AND "kind" = 'LABEL'::"MailSplitKind"
        AND ${labelId} = ANY("values")
    `,
    prisma.mailSplit.deleteMany({
      where: {
        emailAccountId,
        kind: MailSplitKind.LABEL,
        values: { isEmpty: true },
      },
    }),
  ]);
}
