"use server";
import { actionClient } from "@/utils/actions/safe-action";
import { spamFilterSetting } from "./spam-filter.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const setSpamFilterAction = actionClient
  .metadata({ name: "setSpamFilter" })
  .inputSchema(spamFilterSetting)
  .action(
    async ({ ctx: { userId, emailAccountId }, parsedInput: { enabled } }) => {
      if (enabled) {
        const model = await prisma.spamModel.findUnique({
          where: { userId },
          select: { status: true },
        });
        if (model?.status !== "READY")
          throw new SafeError(
            "Import and verify your spam corpus before enabling the filter.",
          );
      }
      await prisma.emailAccount.update({
        where: { id: emailAccountId, userId },
        data: { spamFilterEnabled: enabled },
      });
      return { enabled };
    },
  );
