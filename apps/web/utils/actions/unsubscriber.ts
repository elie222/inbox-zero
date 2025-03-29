"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import type { NewsletterStatus } from "@prisma/client";
import { withActionInstrumentation } from "@/utils/actions/middleware";
import { env } from "@/env";

export const setNewsletterStatusAction = withActionInstrumentation(
  "setNewsletterStatus",
  async (options: {
    newsletterEmail: string;
    status: NewsletterStatus | null;
  }) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    return await prisma.newsletter.upsert({
      where: {
        email_userId: {
          email: options.newsletterEmail,
          userId: session.user.id,
        },
      },
      create: {
        status: options.status,
        email: options.newsletterEmail,
        user: { connect: { id: session.user.id } },
      },
      update: { status: options.status },
    });
  },
);

export const unsubscribeAction = withActionInstrumentation(
  "unsubscribe",
  async (options: { url: string }) => {
    const session = await auth();
    if (!session?.user.email) return { error: "Not logged in" };

    const { url } = options;

    const response = await fetch(
      `${env.UNSUBSCRIBER_API_URL}/unsubscribe?url=${url}&email=${session.user.email}`,
    );

    if (!response.ok) {
      return { error: "Failed to unsubscribe" };
    }

    return { success: true };
  },
);
