import { NextResponse } from "next/server";
import { watchEmails } from "./controller";
import { withAuth } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getOutlookClientWithRefresh } from "@/utils/outlook/client";

export const dynamic = "force-dynamic";

const logger = createScopedLogger("api/outlook/watch");

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const results = [];

  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      userId,
      account: {
        provider: "microsoft-entra-id",
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
        logger.warn("Missing tokens for account", { emailAccountId });
        results.push({
          emailAccountId,
          status: "error",
          message: "Missing authentication tokens.",
        });
        continue;
      }

      const outlookClient = await getOutlookClientWithRefresh({
        accessToken: account.account.access_token,
        refreshToken: account.account.refresh_token,
        expiresAt: account.account.expires_at,
        emailAccountId,
      });

      const expirationDate = await watchEmails({
        emailAccountId,
        client: outlookClient.getClient(),
      });

      if (expirationDate) {
        results.push({
          emailAccountId,
          status: "success",
          expirationDate,
        });
      } else {
        logger.error("Error watching inbox for account", { emailAccountId });
        results.push({
          emailAccountId,
          status: "error",
          message: "Failed to set up watch for this account.",
        });
      }
    } catch (error) {
      logger.error("Exception while watching inbox for account", {
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
