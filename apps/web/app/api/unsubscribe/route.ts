import { NextResponse } from "next/server";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { Frequency } from "@/generated/prisma/enums";

export const GET = withError("unsubscribe", async (request) => {
  return unsubscribe(request);
});

export const POST = withError(async (request) => {
  return unsubscribe(request as RequestWithLogger);
});

async function unsubscribe(request: RequestWithLogger) {
  const url = new URL(request.url);
  const encodedToken = url.searchParams.get("token");

  if (!encodedToken) {
    return NextResponse.json({ error: "Token is required" }, { status: 400 });
  }

  const token = decodeURIComponent(encodedToken);

  // Find and validate token
  const emailToken = await prisma.emailToken.findUnique({
    where: { token },
    include: { emailAccount: true },
  });

  if (!emailToken) {
    return NextResponse.json(
      {
        error:
          "Invalid unsubscribe token. You might have already unsubscribed.",
      },
      { status: 400 },
    );
  }

  if (emailToken.expiresAt < new Date()) {
    return NextResponse.json(
      { error: "Unsubscribe token expired" },
      { status: 400 },
    );
  }

  // Update user preferences

  const [userUpdate, tokenDelete] = await Promise.allSettled([
    prisma.emailAccount.update({
      where: { email: emailToken.emailAccountId },
      data: {
        summaryEmailFrequency: Frequency.NEVER,
        statsEmailFrequency: Frequency.NEVER,
      },
    }),

    // Delete the used token
    prisma.emailToken.delete({ where: { id: emailToken.id } }),
  ]);

  if (userUpdate.status === "rejected") {
    request.logger.error("Error updating user preferences", {
      email: emailToken.emailAccount.email,
      error: userUpdate.reason,
    });
    return NextResponse.json(
      {
        success: false,
        message:
          "Error unsubscribing. Visit Settings page to unsubscribe from emails.",
      },
      { status: 500 },
    );
  }

  if (tokenDelete.status === "rejected") {
    request.logger.error("Error deleting token", {
      email: emailToken.emailAccountId,
      tokenId: emailToken.id,
      error: tokenDelete.reason,
    });
  }

  request.logger.info("User unsubscribed from emails", {
    email: emailToken.emailAccountId,
  });

  return NextResponse.json({ success: true });
}
