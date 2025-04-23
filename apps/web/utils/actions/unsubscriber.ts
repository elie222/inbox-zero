"use server";

import prisma from "@/utils/prisma";
import { setNewsletterStatusBody } from "@/utils/actions/unsubscriber.validation";
import { extractEmailAddress } from "@/utils/email";
import { actionClient } from "@/utils/actions/safe-action";

export const setNewsletterStatusAction = actionClient
  .metadata({ name: "setNewsletterStatus" })
  .schema(setNewsletterStatusBody)
  .action(
    async ({
      parsedInput: { newsletterEmail, status },
      ctx: { email: userEmail },
    }) => {
      const email = extractEmailAddress(newsletterEmail);

      return await prisma.newsletter.upsert({
        where: {
          email_emailAccountId: { email, emailAccountId: userEmail },
        },
        create: {
          status,
          email,
          emailAccountId: userEmail,
        },
        update: { status },
      });
    },
  );
