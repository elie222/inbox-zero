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
    if (!session?.user.id) return { error: "Not logged in" };

    const { data, success, error } =
      setNewsletterStatusBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const { newsletterEmail, status } = data;

    const userId = session.user.id;
    const email = extractEmailAddress(newsletterEmail);

    return await prisma.newsletter.upsert({
      where: {
        email_userId: { email, userId },
      },
      create: {
        status,
        email,
        user: { connect: { id: userId } },
      },
      update: { status },
    });
  },
);
