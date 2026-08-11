"use server";

import { randomUUID } from "node:crypto";
import type { MailSplit } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  createMailSplitBody,
  deleteMailSplitBody,
  renameMailSplitBody,
  updateMailPreferencesBody,
} from "@/utils/actions/mail-split.validation";

const MAX_SPLITS = 12;

export const createMailSplitAction = actionClient
  .metadata({ name: "createMailSplit" })
  .inputSchema(createMailSplitBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { name, kind, value } }) => {
      const [, createdSplits, duplicate, splitCount] =
        await prisma.$transaction([
          prisma.$queryRaw`
            SELECT true AS locked
            FROM (
              SELECT pg_advisory_xact_lock(742931, hashtext(${emailAccountId}))
            ) lock
          `,
          prisma.$queryRaw<MailSplit[]>`
            WITH split_state AS (
              SELECT
                COUNT(*)::integer AS count,
                COALESCE(MAX("order"), -1)::integer + 1 AS next_order
              FROM "MailSplit"
              WHERE "emailAccountId" = ${emailAccountId}
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
              ${randomUUID()},
              CURRENT_TIMESTAMP,
              CURRENT_TIMESTAMP,
              ${name},
              ${kind}::"MailSplitKind",
              ${value ?? null},
              split_state.next_order,
              ${emailAccountId}
            FROM split_state
            WHERE split_state.count < ${MAX_SPLITS}
              AND NOT EXISTS (
                SELECT 1
                FROM "MailSplit"
                WHERE "emailAccountId" = ${emailAccountId}
                  AND "name" = ${name}
              )
            RETURNING *
          `,
          prisma.mailSplit.findUnique({
            where: { emailAccountId_name: { emailAccountId, name } },
            select: { id: true },
          }),
          prisma.mailSplit.count({ where: { emailAccountId } }),
        ]);

      const [split] = createdSplits;
      if (!split) {
        if (duplicate) {
          throw new SafeError(`You already have a "${name}" split.`);
        }
        if (splitCount >= MAX_SPLITS) {
          throw new SafeError(`You can only have ${MAX_SPLITS} splits.`);
        }
        throw new SafeError("Could not create split. Please try again.");
      }

      return { split };
    },
  );

export const renameMailSplitAction = actionClient
  .metadata({ name: "renameMailSplit" })
  .inputSchema(renameMailSplitBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id, name } }) => {
    try {
      const { count } = await prisma.mailSplit.updateMany({
        where: { id, emailAccountId },
        data: { name },
      });
      if (!count) throw new SafeError("Split not found");
    } catch (error) {
      if (isDuplicateError(error, "name")) {
        throw new SafeError(`You already have a "${name}" split.`);
      }
      throw error;
    }
  });

export const deleteMailSplitAction = actionClient
  .metadata({ name: "deleteMailSplit" })
  .inputSchema(deleteMailSplitBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    // deleteMany rather than delete so another account's id can never be removed
    await prisma.mailSplit.deleteMany({ where: { id, emailAccountId } });
  });

export const updateMailPreferencesAction = actionClient
  .metadata({ name: "updateMailPreferences" })
  .inputSchema(updateMailPreferencesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { layout, hintBarDismissed },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          ...(layout === undefined ? {} : { mailLayout: layout }),
          ...(hintBarDismissed === undefined
            ? {}
            : { mailHintBarDismissed: hintBarDismissed }),
        },
      });
    },
  );
