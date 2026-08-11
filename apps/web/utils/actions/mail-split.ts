"use server";

import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
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
      const existing = await prisma.mailSplit.count({
        where: { emailAccountId },
      });
      if (existing >= MAX_SPLITS)
        throw new SafeError(`You can only have ${MAX_SPLITS} splits.`);

      const duplicate = await prisma.mailSplit.findUnique({
        where: { emailAccountId_name: { emailAccountId, name } },
        select: { id: true },
      });
      if (duplicate) throw new SafeError(`You already have a "${name}" split.`);

      // Derived from the highest order rather than the count: deleting a split
      // from the middle would otherwise hand the next one a duplicate order.
      const last = await prisma.mailSplit.findFirst({
        where: { emailAccountId },
        orderBy: { order: "desc" },
        select: { order: true },
      });

      const split = await prisma.mailSplit.create({
        data: {
          emailAccountId,
          name,
          kind,
          value: value ?? null,
          order: (last?.order ?? -1) + 1,
        },
      });

      return { split };
    },
  );

export const renameMailSplitAction = actionClient
  .metadata({ name: "renameMailSplit" })
  .inputSchema(renameMailSplitBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id, name } }) => {
    const { count } = await prisma.mailSplit.updateMany({
      where: { id, emailAccountId },
      data: { name },
    });
    if (!count) throw new SafeError("Split not found");
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
