import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { unwatchEmails } from "@/utils/email/watch-manager";

export const POST = withEmailProvider(async (request) => {
  const logger = request.logger;
  const emailAccountId = request.auth.emailAccountId;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: { watchEmailsSubscriptionId: true },
  });

  try {
    await unwatchEmails({
      emailAccountId,
      provider: request.emailProvider,
      subscriptionId: emailAccount?.watchEmailsSubscriptionId,
      logger,
    });

    return NextResponse.json({
      status: "success",
      message: "Successfully unwatched emails for this account.",
    });
  } catch (error) {
    logger.error("Exception while unwatching emails for account", { error });
    return NextResponse.json(
      {
        status: "error",
        message: "An unexpected error occurred while unwatching this account.",
        errorDetails: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
});
