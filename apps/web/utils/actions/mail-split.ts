"use server";

import type { MailSplit } from "@/generated/prisma/client";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  buildMailSplitFromPromptBody,
  createMailSplitBody,
  deleteMailSplitBody,
  updateMailPreferencesBody,
  updateMailSplitBody,
} from "@/utils/actions/mail-split.validation";
import type { MailSplitFilterDraft } from "@/utils/mail/split-filters";
import { aiPromptToSplitFilters } from "@/utils/ai/split/prompt-to-split";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { createMailSplit, toFilterRows } from "@/utils/mail/splits.server";
import { lockMailSplits } from "@/utils/mail/split-lock";
import { MAX_MAIL_SPLITS } from "@/utils/mail/split-constants";

export const createMailSplitAction = actionClient
  .metadata({ name: "createMailSplit" })
  .inputSchema(createMailSplitBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { name, filters, matchAll },
    }) => {
      const split = await createMailSplitOrThrow({
        emailAccountId,
        name,
        matchAll,
        filters,
      });
      return { split };
    },
  );

export const updateMailSplitAction = actionClient
  .metadata({ name: "updateMailSplit" })
  .inputSchema(updateMailSplitBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { id, name, filters, matchAll },
    }) => {
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
    },
  );

/**
 * Turns a description into conditions the reader then reviews in the builder —
 * it never creates the split outright, so a wrong guess costs a click, not a tab.
 */
export const buildMailSplitFromPromptAction = actionClient
  .metadata({ name: "buildMailSplitFromPrompt" })
  .inputSchema(buildMailSplitFromPromptBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { prompt, options, senders },
    }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) throw new SafeError("Email account not found");

      const result = await aiPromptToSplitFilters({
        emailAccount,
        prompt,
        options,
        senders,
      });

      if (!result.filters.length) {
        throw new SafeError(
          "I couldn't find filters in that — name a sender, label or category.",
        );
      }

      return {
        filters: result.filters,
        name: result.name?.trim().slice(0, 60) || null,
        matchAll: result.matchAll,
      };
    },
  );

export const deleteMailSplitAction = actionClient
  .metadata({ name: "deleteMailSplit" })
  .inputSchema(deleteMailSplitBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    // deleteMany rather than delete so another account's id can never be removed
    await prisma.$transaction([
      lockMailSplits(emailAccountId),
      prisma.mailSplit.deleteMany({ where: { id, emailAccountId } }),
    ]);
  });

export const updateMailPreferencesAction = actionClient
  .metadata({ name: "updateMailPreferences" })
  .inputSchema(updateMailPreferencesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { layout, expandedPreview },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          ...(layout === undefined ? {} : { mailLayout: layout }),
          ...(expandedPreview === undefined
            ? {}
            : { mailExpandedPreview: expandedPreview }),
        },
      });
    },
  );

async function createMailSplitOrThrow({
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
