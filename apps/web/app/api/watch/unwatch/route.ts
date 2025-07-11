import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { unwatchEmails } from "../controller";

export const dynamic = "force-dynamic";

const logger = createScopedLogger("api/watch/unwatch");

export const POST = withEmailProvider(async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  // Get the subscription ID for this account
  const emailAccount = await prisma.emailAccount.findUnique({
    where: { id: emailAccountId },
    select: {
      watchEmailsSubscriptionId: true,
    },
  });

  try {
    await unwatchEmails({
      emailAccountId,
      provider: request.emailProvider,
      subscriptionId: emailAccount?.watchEmailsSubscriptionId,
    });

    return NextResponse.json({
      status: "success",
      message: "Successfully unwatched emails for this account.",
    });
  } catch (error) {
    logger.error("Exception while unwatching emails for account", {
      emailAccountId,
      error,
    });
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
