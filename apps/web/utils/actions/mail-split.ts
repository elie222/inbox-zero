"use server";

import type { MailSplit } from "@/generated/prisma/client";
import { MailSplitKind } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  createMailSplitBody,
  deleteMailSplitBody,
  renameMailSplitBody,
  setDefaultMailSplitsBody,
  suggestMailSplitBody,
  updateMailPreferencesBody,
} from "@/utils/actions/mail-split.validation";
import { aiPromptToSplit } from "@/utils/ai/split/prompt-to-split";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { lockMailSplits } from "@/utils/mail/split-lock";
import { createMailSplit } from "@/utils/mail/splits.server";
import { BUILT_IN_SPLITS } from "@/utils/mail/built-in-splits";
import {
  MAX_MAIL_SPLITS,
  MAX_SPLIT_LABELS,
} from "@/utils/mail/split-constants";
import {
  getDefaultMailSplitDraftsForAccount,
  setDefaultMailSplits,
} from "@/utils/mail/default-splits.server";

export const createMailSplitAction = actionClient
  .metadata({ name: "createMailSplit" })
  .inputSchema(createMailSplitBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { name, kind, values },
    }) => {
      const split = await createMailSplitOrThrow({
        emailAccountId,
        name,
        kind,
        values,
      });
      return { split };
    },
  );

/**
 * Resolves a description into a selection of the account's own filters. It
 * deliberately stops short of creating the split so the picker can show what
 * was matched and let the user adjust it first.
 */
export const suggestMailSplitAction = actionClient
  .metadata({ name: "suggestMailSplit" })
  .inputSchema(suggestMailSplitBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { prompt, options } }) => {
      const emailAccount = await getEmailAccountWithAi({ emailAccountId });
      if (!emailAccount) throw new SafeError("Email account not found");

      const suggestion = await aiPromptToSplit({
        emailAccount,
        prompt,
        options: options.map(({ id, name, kind }) => ({ id, name, kind })),
      });

      const optionsById = new Map(options.map((option) => [option.id, option]));
      const matched = suggestion.optionIds.flatMap((optionId) => {
        const option = optionsById.get(optionId);
        return option ? [option] : [];
      });
      // Only labels stack into one query, so a mixed pick collapses to the
      // first option rather than producing a split we cannot run.
      const selected = matched.every(
        (option) => option.kind === MailSplitKind.LABEL,
      )
        ? matched
        : matched.slice(0, 1);

      return {
        optionIds: [...new Set(selected.map((option) => option.id))].slice(
          0,
          MAX_SPLIT_LABELS,
        ),
        name: suggestion.name?.trim().slice(0, 60) || null,
        reasoning: suggestion.reasoning,
      };
    },
  );

export const renameMailSplitAction = actionClient
  .metadata({ name: "renameMailSplit" })
  .inputSchema(renameMailSplitBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id, name } }) => {
    try {
      const [, { count }] = await prisma.$transaction([
        lockMailSplits(emailAccountId),
        prisma.mailSplit.updateMany({
          where: { id, emailAccountId },
          data: { name },
        }),
      ]);
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

export const setDefaultMailSplitsAction = actionClient
  .metadata({ name: "setDefaultMailSplits" })
  .inputSchema(setDefaultMailSplitsBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    const defaultSplits =
      await getDefaultMailSplitDraftsForAccount(emailAccountId);
    const result = await setDefaultMailSplits({
      emailAccountId,
      defaultSplits,
      enabled,
    });
    if (result?.status === "limit") {
      throw new SafeError(`You can only have ${MAX_MAIL_SPLITS} splits.`);
    }
  });

export const updateMailPreferencesAction = actionClient
  .metadata({ name: "updateMailPreferences" })
  .inputSchema(updateMailPreferencesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { layout, expandedPreview, hiddenBuiltInSplits },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          ...(layout === undefined ? {} : { mailLayout: layout }),
          ...(hiddenBuiltInSplits === undefined
            ? {}
            : { mailHiddenBuiltInSplits: hiddenBuiltInSplits }),
          ...(expandedPreview === undefined
            ? {}
            : { mailExpandedPreview: expandedPreview }),
        },
      });
    },
  );

async function createMailSplitOrThrow(
  data: Pick<MailSplit, "emailAccountId" | "name" | "kind" | "values">,
) {
  const builtIn = BUILT_IN_SPLITS.find((split) => split.kind === data.kind);
  if (builtIn) {
    await prisma.$executeRaw`
      UPDATE "EmailAccount"
      SET "mailHiddenBuiltInSplits" = array_remove("mailHiddenBuiltInSplits", ${builtIn.id}),
          "updatedAt" = NOW()
      WHERE id = ${data.emailAccountId}
    `;
    return builtIn;
  }

  try {
    const result = await createMailSplit(data);

    if (!result) {
      throw new SafeError("Could not create split. Please try again.");
    }
    if (result.status !== "created") {
      if (result.status === "duplicate") {
        throw new SafeError(`You already have a "${data.name}" split.`);
      }
      throw new SafeError(`You can only have ${MAX_MAIL_SPLITS} splits.`);
    }

    const { status: _, ...split } = result;
    return split;
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      throw new SafeError(`You already have a "${data.name}" split.`);
    }
    throw error;
  }
}
