"use server";

import prisma from "@/utils/prisma";
import { actionClient } from "@/utils/actions/safe-action";
import {
  deleteLabelCleanupBody,
  saveLabelCleanupBody,
} from "@/utils/actions/label-cleanup.validation";

export const saveLabelCleanupAction = actionClient
  .metadata({ name: "saveLabelCleanup" })
  .inputSchema(saveLabelCleanupBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { labelId, labelName, afterDays, action },
    }) => {
      await prisma.labelCleanup.upsert({
        where: { emailAccountId_labelId: { emailAccountId, labelId } },
        update: { labelName, afterDays, action },
        create: { emailAccountId, labelId, labelName, afterDays, action },
      });
    },
  );

export const deleteLabelCleanupAction = actionClient
  .metadata({ name: "deleteLabelCleanup" })
  .inputSchema(deleteLabelCleanupBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { id } }) => {
    await prisma.labelCleanup.deleteMany({ where: { id, emailAccountId } });
  });
