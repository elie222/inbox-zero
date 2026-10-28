import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";
import type {
  UpdateMailSplitBody,
  DeleteMailSplitBody,
} from "@/utils/actions/mail-split.validation";
import { randomUUID } from "node:crypto";
import type { MailSplit } from "@/generated/prisma/client";
import { MailSplitFilterKind } from "@/generated/prisma/enums";
import type { MailSplitFilterDraft } from "@/utils/split-inbox/split-filters";
import prisma from "@/utils/prisma";
import { lockMailSplits } from "@/utils/split-inbox/split-lock";
import { MAX_MAIL_SPLITS } from "@/utils/split-inbox/split-constants";

type CreateMailSplitResult =
  | ({ status: "created" } & MailSplit)
  | { status: "duplicate" | "limit" };

export async function createMailSplit({
  emailAccountId,
  name,
  matchAll,
  filters,
}: {
  emailAccountId: string;
  name: string;
  matchAll: boolean;
  filters: MailSplitFilterDraft[];
}) {
  // The id is chosen up front so the split and its conditions can be written in
  // one transaction without a round trip in between.
  const splitId = randomUUID();

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
          "matchAll",
          "order",
          "emailAccountId"
        )
        SELECT
          ${splitId},
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          ${name},
          ${matchAll},
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
    // Guarded on the split existing, so a rejected insert above (limit reached,
    // duplicate name) can't leave conditions pointing at nothing.
    prisma.$executeRaw`
      INSERT INTO "MailSplitFilter" ("id", "kind", "value", "order", "mailSplitId")
      SELECT
        conditions."id",
        conditions."kind"::"MailSplitFilterKind",
        conditions."value",
        conditions."order",
        ${splitId}
      FROM jsonb_to_recordset(${toFilterRows(filters)}::jsonb)
        AS conditions("id" text, "kind" text, "value" text, "order" integer)
      WHERE EXISTS (SELECT 1 FROM "MailSplit" WHERE "id" = ${splitId})
    `,
  ]);

  return results[0];
}

export function toFilterRows(filters: MailSplitFilterDraft[]) {
  return JSON.stringify(
    filters.map((filter, order) => ({
      id: randomUUID(),
      kind: filter.kind,
      value: filter.value ?? null,
      order,
    })),
  );
}

export async function removeLabelFromMailSplits({
  emailAccountId,
  labelId,
}: {
  emailAccountId: string;
  labelId: string;
}) {
  await prisma.$transaction([
    lockMailSplits(emailAccountId),
    prisma.mailSplit.deleteMany({
      where: {
        emailAccountId,
        filters: {
          some: {},
          every: { kind: MailSplitFilterKind.LABEL, value: labelId },
        },
      },
    }),
    prisma.mailSplit.updateMany({
      where: {
        emailAccountId,
        filters: { some: { kind: MailSplitFilterKind.LABEL, value: labelId } },
      },
      data: { updatedAt: new Date() },
    }),
    prisma.mailSplitFilter.deleteMany({
      where: {
        kind: MailSplitFilterKind.LABEL,
        value: labelId,
        mailSplit: { emailAccountId },
      },
    }),
  ]);
}

/** Reorder only the selected slots so hidden splits keep their positions. */
export async function reorderMailSplits({
  emailAccountId,
  ids,
}: {
  emailAccountId: string;
  ids: string[];
}) {
  await prisma.$transaction([
    lockMailSplits(emailAccountId),
    prisma.$executeRaw`
      WITH selected AS (
        SELECT "id", "order", "createdAt"
        FROM "MailSplit"
        WHERE "emailAccountId" = ${emailAccountId}
          AND "id" = ANY(${ids}::text[])
      ),
      positions AS (
        SELECT "order", ROW_NUMBER() OVER (ORDER BY "order", "createdAt", "id") AS slot
        FROM selected
      ),
      reordered AS (
        SELECT "id", ROW_NUMBER() OVER (ORDER BY array_position(${ids}::text[], "id")) AS slot
        FROM selected
      )
      UPDATE "MailSplit" split
      SET "order" = positions."order", "updatedAt" = CURRENT_TIMESTAMP
      FROM reordered JOIN positions USING (slot)
      WHERE split."id" = reordered."id"
    `,
  ]);
}

export async function createMailSplitOrThrow({
  emailAccountId,
  name,
  matchAll,
  filters,
}: {
  emailAccountId: string;
  name: string;
  matchAll: boolean;
  filters: MailSplitFilterDraft[];
}): Promise<MailSplit> {
  try {
    const result = await createMailSplit({
      emailAccountId,
      name,
      matchAll,
      filters,
    });

    if (!result) {
      throw new SafeError("Could not create split. Please try again.");
    }
    if (result.status !== "created") {
      if (result.status === "duplicate") {
        throw new SafeError(`You already have a "${name}" split.`);
      }
      throw new SafeError(`You can only have ${MAX_MAIL_SPLITS} splits.`);
    }

    const { status: _, ...split } = result;
    return split;
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      throw new SafeError(`You already have a "${name}" split.`);
    }
    throw error;
  }
}

export async function updateMailSplit({
  emailAccountId,
  id,
  name,
  filters,
  matchAll,
}: UpdateMailSplitBody & { emailAccountId: string }) {
  try {
    // One transaction so a split can never end up renamed but still
    // carrying its old conditions. Filters are replaced wholesale rather
    // than diffed: the builder hands back the conditions it is showing, so
    // anything missing from that list was removed.
    const [, { count }] = await prisma.$transaction([
      lockMailSplits(emailAccountId),
      prisma.mailSplit.updateMany({
        where: { id, emailAccountId },
        data: { name, matchAll },
      }),
      // Scoped through the split's owner, so another account's id can't
      // reach these rows even though `id` is caller-supplied.
      prisma.mailSplitFilter.deleteMany({
        where: { mailSplitId: id, mailSplit: { emailAccountId } },
      }),
      prisma.$executeRaw`
            INSERT INTO "MailSplitFilter" ("id", "kind", "value", "order", "mailSplitId")
            SELECT
              conditions."id",
              conditions."kind"::"MailSplitFilterKind",
              conditions."value",
              conditions."order",
              ${id}
            FROM jsonb_to_recordset(${toFilterRows(filters)}::jsonb)
              AS conditions("id" text, "kind" text, "value" text, "order" integer)
            WHERE EXISTS (
              SELECT 1 FROM "MailSplit"
              WHERE "id" = ${id} AND "emailAccountId" = ${emailAccountId}
            )
          `,
    ]);
    if (!count) throw new SafeError("Split not found");
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      throw new SafeError(`You already have a "${name}" split.`);
    }
    throw error;
  }
}

export async function deleteMailSplit({
  emailAccountId,
  id,
}: DeleteMailSplitBody & { emailAccountId: string }) {
  // deleteMany rather than delete so another account's id can never be removed
  const [, { count }] = await prisma.$transaction([
    lockMailSplits(emailAccountId),
    prisma.mailSplit.deleteMany({
      where: { id, emailAccountId, filters: { some: {} } },
    }),
  ]);
  if (!count) throw new SafeError("Split not found or cannot be removed");
}
