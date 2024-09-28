"use server";

import { auth } from "@/app/api/auth/[...nextauth]/auth";
import type { ServerActionResponse } from "@/utils/error";
import prisma from "@/utils/prisma";
import type { NewsletterStatus } from "@prisma/client";

export async function setNewsletterStatusAction(options: {
  newsletterEmail: string;
  status: NewsletterStatus | null;
}): Promise<ServerActionResponse> {
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
}
