import { NextResponse } from "next/server";
import { withAuth } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { watchEmails } from "./controller";
import { createEmailProvider } from "@/utils/email/provider";

export const dynamic = "force-dynamic";

const logger = createScopedLogger("api/watch");

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const results = [];

  const emailAccounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: {
      id: true,
      account: {
        select: {
          provider: true,
          access_token: true,
          refresh_token: true,
          expires_at: true,
        },
      },
    },
  });

  if (emailAccounts.length === 0) {
    return NextResponse.json(
      { message: "No email accounts found for this user." },
      { status: 404 },
    );
  }

  for (const { id: emailAccountId, account } of emailAccounts) {
    try {
      // Check for missing tokens for Microsoft accounts
      if (!account.access_token || !account.refresh_token) {
        logger.warn("Missing tokens for account", { emailAccountId });
        results.push({
          emailAccountId,
          status: "error",
          message: "Missing authentication tokens.",
        });
        continue;
      }

      // Create email provider for this account
      const provider = await createEmailProvider({
        emailAccountId,
        provider: account.provider,
      });

      const result = await watchEmails({
        emailAccountId,
        provider,
      });

      if (result.success) {
        results.push({
          emailAccountId,
          status: "success",
          expirationDate: result.expirationDate,
        });
      } else {
        logger.error("Error watching inbox for account", {
          emailAccountId,
          provider: account.provider,
          error: result.error,
        });
        results.push({
          emailAccountId,
          status: "error",
          message: "Failed to set up watch for this account.",
          errorDetails: result.error,
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
