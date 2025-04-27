import { actionClient, actionClientUser } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
} from "@/utils/actions/settings.validation";
import prisma from "@/utils/prisma";

export const updateEmailSettingsAction = actionClient
  .metadata({ name: "updateEmailSettings" })
  .schema(saveEmailUpdateSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { statsEmailFrequency, summaryEmailFrequency },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          statsEmailFrequency,
          summaryEmailFrequency,
        },
      });
    },
  );

export const updateAiSettingsAction = actionClientUser
  .metadata({ name: "updateAiSettings" })
  .schema(saveAiSettingsBody)
  .action(
    async ({
      ctx: { userId },
      parsedInput: { aiProvider, aiModel, aiApiKey },
    }) => {
      await prisma.user.update({
        where: { id: userId },
        data: { aiProvider, aiModel, aiApiKey },
      });
    },
  );
