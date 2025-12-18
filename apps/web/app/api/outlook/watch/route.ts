import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
import { createManagedOutlookSubscription } from "@/utils/outlook/subscription-manager";

export const dynamic = "force-dynamic";

export const GET = withAuth("outlook/watch", async (request) => {
  const userId = request.auth.userId;
  const results = [];

  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      userId,
      account: {
        provider: "microsoft",
      },
    },
    select: { id: true },
  });

  if (emailAccounts.length === 0) {
    return NextResponse.json(
      { message: "No Microsoft email accounts found for this user." },
      { status: 404 },
    );
  }

  for (const { id: emailAccountId } of emailAccounts) {
    try {
      const account = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          account: {
            select: {
              access_token: true,
              refresh_token: true,
              expires_at: true,
            },
          },
        },
      });

      if (!account?.account.access_token || !account?.account.refresh_token) {
        request.logger.warn("Missing tokens for account", { emailAccountId });
        results.push({
          emailAccountId,
          status: "error",
          message: "Missing authentication tokens.",
        });
        continue;
      }

      const expirationDate = await createManagedOutlookSubscription({
        emailAccountId,
        logger: request.logger,
      });

      if (expirationDate) {
        results.push({
          emailAccountId,
          status: "success",
          expirationDate,
        });
      } else {
        request.logger.error("Error watching inbox for account", {
          emailAccountId,
        });
        results.push({
          emailAccountId,
          status: "error",
          message: "Failed to set up watch for this account.",
        });
      }
    } catch (error) {
      request.logger.error("Exception while watching inbox for account", {
        emailAccountId,
        error,
      });
      results.push({
        emailAccountId,
        status: "error",
        message:
          "An unexpected error occurred while setting up watch for this account.",
        errorDetails: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ results });
});
