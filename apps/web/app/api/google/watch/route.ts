import { NextResponse } from "next/server";
import { watchEmails } from "./controller";
import { withAuth } from "@/utils/middleware";
import { createScopedLogger } from "@/utils/logger";
import { getGmailClientForEmailId } from "@/utils/account";
import prisma from "@/utils/prisma";

export const dynamic = "force-dynamic";

const logger = createScopedLogger("api/google/watch");

export const GET = withAuth(async (request) => {
  const userId = request.auth.userId;
  const results = [];

  const emailAccounts = await prisma.emailAccount.findMany({
    where: { userId },
    select: { id: true },
  });

  if (emailAccounts.length === 0) {
    return NextResponse.json(
      { message: "No email accounts found for this user." },
      { status: 404 },
    );
  }

  for (const { id: emailAccountId } of emailAccounts) {
    try {
      const gmail = await getGmailClientForEmailId({ emailAccountId });
      const expirationDate = await watchEmails({ emailAccountId, gmail });

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
