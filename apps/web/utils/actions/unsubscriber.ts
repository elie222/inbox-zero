"use server";

import {
  setNewsletterStatusBody,
  unsubscribeSenderBody,
} from "@/utils/actions/unsubscriber.validation";
import { actionClient } from "@/utils/actions/safe-action";
import {
  setSenderStatus,
  unsubscribeSenderAndMark,
} from "@/utils/senders/unsubscribe";

export const setNewsletterStatusAction = actionClient
  .metadata({ name: "setNewsletterStatus" })
  .inputSchema(setNewsletterStatusBody)
  .action(
    async ({
      parsedInput: { newsletterEmail, status },
      ctx: { emailAccountId },
    }) => {
      return setSenderStatus({
        emailAccountId,
        newsletterEmail,
        status,
      });
    },
  );

export const unsubscribeSenderAction = actionClient
  .metadata({ name: "unsubscribeSender" })
  .inputSchema(unsubscribeSenderBody)
  .action(
    async ({
      parsedInput: { newsletterEmail, unsubscribeLink, listUnsubscribeHeader },
      ctx: { emailAccountId, logger },
    }) => {
      return unsubscribeSenderAndMark({
        emailAccountId,
        newsletterEmail,
        unsubscribeLink,
        listUnsubscribeHeader,
        logger,
      });
    },
  );
