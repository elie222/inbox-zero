"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import {
  setNewsletterStatusBody,
  type SetNewsletterStatusBody,
} from "@/utils/actions/unsubscriber.validation";
import { extractEmailAddress } from "@/utils/email";

export const setNewsletterStatusAction = withActionInstrumentation(
  "setNewsletterStatus",
  async (unsafeData: SetNewsletterStatusBody) => {
    const session = await auth();
    const userEmail = session?.user.email;
    if (!userEmail) return { error: "Not logged in" };

    const { data, success, error } =
      setNewsletterStatusBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const { newsletterEmail, status } = data;

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
