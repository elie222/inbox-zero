"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import {
  setNewsletterStatusBody,
  type SetNewsletterStatusBody,
} from "@/utils/actions/unsubscriber.validation";

export const setNewsletterStatusAction = withActionInstrumentation(
  "setNewsletterStatus",
  async (unsafeData: SetNewsletterStatusBody) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const { data, success, error } =
      setNewsletterStatusBody.safeParse(unsafeData);
    if (!success) return { error: error.message };

    const { newsletterEmail, status } = data;

    return await prisma.newsletter.upsert({
      where: {
        email_userId: {
          email: newsletterEmail,
          userId: session.user.id,
        },
      },
      create: {
        status,
        email: newsletterEmail,
        user: { connect: { id: session.user.id } },
      },
      update: { status },
    });
  },
);
