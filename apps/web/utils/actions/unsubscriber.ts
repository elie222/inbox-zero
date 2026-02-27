"use server";

import {
  setNewsletterStatusBody,
  unsubscribeSenderBody,
} from "@/utils/actions/unsubscriber.validation";
import { actionClient } from "@/utils/actions/safe-action";
import {
  setNewsletterStatus,
  unsubscribeSenderAndMark,
} from "@/utils/newsletter-unsubscribe";

export const setNewsletterStatusAction = actionClient
  .metadata({ name: "setNewsletterStatus" })
  .inputSchema(setNewsletterStatusBody)
  .action(
    async ({
      parsedInput: { newsletterEmail, status },
      ctx: { emailAccountId },
    }) => {
      return setNewsletterStatus({
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
