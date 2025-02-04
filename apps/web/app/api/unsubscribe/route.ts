import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { Frequency } from "@prisma/client";

const logger = createScopedLogger("unsubscribe");

const unsubscribeBody = z.object({ token: z.string() });

export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const { token } = unsubscribeBody.parse(json);

  // Find and validate token
  const emailToken = await prisma.emailToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!emailToken) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  if (emailToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 400 });
  }

  // Update user preferences

  const [userUpdate, tokenDelete] = await Promise.allSettled([
    prisma.user.update({
      where: { id: emailToken.userId },
      data: {
        summaryEmailFrequency: Frequency.NEVER,
        statsEmailFrequency: Frequency.NEVER,
      },
    }),

    // Delete the used token
    prisma.emailToken.delete({ where: { id: emailToken.id } }),
  ]);

  if (userUpdate.status === "rejected") {
    logger.error("Error updating user preferences", {
      email: emailToken.user.email,
      error: userUpdate.reason,
    });
  }

  if (tokenDelete.status === "rejected") {
    logger.error("Error deleting token", {
      email: emailToken.user.email,
      tokenId: emailToken.id,
      error: tokenDelete.reason,
    });
  }

  logger.info("User unsubscribed from emails", {
    userId: emailToken.userId,
    email: emailToken.user.email,
  });

  return NextResponse.json({ success: true });
});
