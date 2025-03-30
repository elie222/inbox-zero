import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { processPreviousSentEmails } from "@/utils/reply-tracker/check-previous-emails";
import { getGmailClient } from "@/utils/gmail/client";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { isValidInternalApiKey } from "@/utils/internal-api";
import { headers } from "next/headers";

const logger = createScopedLogger("api/reply-tracker/process-previous");

export const maxDuration = 300;

const processPreviousSchema = z.object({ userId: z.string() });
export type ProcessPreviousBody = z.infer<typeof processPreviousSchema>;

export const POST = withError(async (request: Request) => {
  if (!isValidInternalApiKey(await headers())) {
    logger.error("Invalid API key");
    return NextResponse.json({ error: "Invalid API key" });
  }

  const json = await request.json();
  const body = processPreviousSchema.parse(json);

  const user = await prisma.user.findUnique({
    where: { id: body.userId },
    include: {
      accounts: {
        where: { provider: "google" },
        select: { access_token: true, refresh_token: true },
      },
    },
  });
  if (!user) return NextResponse.json({ error: "User not found" });

  logger.info("Processing previous emails for user", { userId: user.id });

  const account = user.accounts[0];
  if (!account) return NextResponse.json({ error: "No Google account found" });
  if (!account.access_token)
    return NextResponse.json({ error: "No access token or refresh token" });

  const gmail = getGmailClient({
    accessToken: account.access_token,
    refreshToken: account.refresh_token ?? undefined,
  });

  await processPreviousSentEmails(gmail, user);

  return NextResponse.json({ success: true });
});
