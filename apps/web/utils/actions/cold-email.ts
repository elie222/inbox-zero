"use server";

import { z } from "zod";
import { withServerActionInstrumentation } from "@sentry/nextjs";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { ColdEmailStatus } from "@prisma/client";

const markNotColdEmailBody = z.object({ sender: z.string() });

export async function markNotColdEmail(body: { sender: string }) {
  return await withServerActionInstrumentation(
    "markNotColdEmail",
    {
      recordResponse: true,
    },
    async () => {
      const session = await auth();
      if (!session?.user.id) throw new Error("Not logged in");

      const { data, error } = markNotColdEmailBody.safeParse(body);
      if (error) return { error: error.message };

      const { sender } = data;
      await prisma.newsletter.update({
        where: { email_userId: { email: sender, userId: session.user.id } },
        data: {
          coldEmail: ColdEmailStatus.NOT_COLD_EMAIL,
        },
      });

      return { ok: true };
    },
  );
}
