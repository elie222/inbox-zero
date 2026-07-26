"use server";

import {
  setSenderStatusBody,
  unsubscribeSenderBody,
} from "@/utils/actions/unsubscriber.validation";
import { actionClient } from "@/utils/actions/safe-action";
import { createEmailProvider } from "@/utils/email/provider";
import {
  setSenderStatusWithAutoArchive,
  unsubscribeSenderAndMark,
} from "@/utils/senders/unsubscribe";

export const setSenderStatusAction = actionClient
  .metadata({ name: "setSenderStatus" })
  .inputSchema(setSenderStatusBody)
  .action(
    async ({
      parsedInput: { senderEmail, status, labelId, labelName },
      ctx: { emailAccountId, provider, logger },
    }) => {
      const emailProvider = await createEmailProvider({
        emailAccountId,
        provider,
        logger,
      });

      return setSenderStatusWithAutoArchive({
        emailAccountId,
        emailProvider,
        senderEmail,
        status,
        labelId,
        labelName,
        logger,
      });
    },
  );

export const unsubscribeSenderAction = actionClient
  .metadata({ name: "unsubscribeSender" })
  .inputSchema(unsubscribeSenderBody)
  .action(
    async ({
      parsedInput: { senderEmail, unsubscribeLink, listUnsubscribeHeader },
      ctx: { emailAccountId, logger },
    }) =>
      unsubscribeSenderAndMark({
        emailAccountId,
        senderEmail,
        unsubscribeLink,
        listUnsubscribeHeader,
        logger,
      }),
  );
