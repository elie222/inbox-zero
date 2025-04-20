import { z } from "zod";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { isValidInternalApiKey } from "@/utils/internal-api";

const logger = createScopedLogger("api/reply-tracker/process-previous");

export const maxDuration = 300;

const processPreviousSchema = z.object({ email: z.string() });
export type ProcessPreviousBody = z.infer<typeof processPreviousSchema>;

export const POST = withError(async (request: Request) => {
  if (!isValidInternalApiKey(await headers())) {
    logger.error("Invalid API key");
    return NextResponse.json({ error: "Invalid API key" });
  }

  const json = await request.json();
  const body = processPreviousSchema.parse(json);
  const email = body.email;

  const emailAccount = await prisma.emailAccount.findUnique({
    where: { email },
    include: {
      account: {
        select: { access_token: true, refresh_token: true },
      },
    },
  });
  if (!emailAccount) return NextResponse.json({ error: "User not found" });

  logger.info("Processing previous emails for user", { email });

  if (!emailAccount.account?.access_token)
    return NextResponse.json({ error: "No access token or refresh token" });

  const gmail = getGmailClient({
    accessToken: emailAccount.account.access_token,
    refreshToken: emailAccount.account.refresh_token ?? undefined,
  });

  await processPreviousSentEmails(gmail, emailAccount);

  return NextResponse.json({ success: true });
});
