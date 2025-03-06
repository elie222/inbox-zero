import { z } from "zod";
import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { publishToQstash } from "@/utils/upstash";
import { getThreadMessages } from "@/utils/gmail/thread";
import { getGmailClient } from "@/utils/gmail/client";
import type { CleanGmailBody } from "@/app/api/clean/gmail/route";
import { SafeError } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { aiClean } from "@/utils/ai/clean/ai-clean";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { getAiUserWithTokens } from "@/utils/user/get";

const logger = createScopedLogger("api/clean");

const cleanThreadBody = z.object({
  userId: z.string(),
  threadId: z.string(),
  archiveLabelId: z.string(),
  processedLabelId: z.string(),
});
export type CleanThreadBody = z.infer<typeof cleanThreadBody>;

async function cleanThread(body: CleanThreadBody) {
  // 1. get thread with messages
  // 2. process thread with ai / fixed logic
  // 3. add to gmail action queue

  const user = await getAiUserWithTokens({ id: body.userId });

  if (!user) throw new SafeError("User not found", 404);

  if (!user.tokens) throw new SafeError("No Gmail account found", 404);
  if (!user.tokens.access_token || !user.tokens.refresh_token)
    throw new SafeError("No Gmail account found", 404);

  const gmail = getGmailClient({
    accessToken: user.tokens.access_token,
    refreshToken: user.tokens.refresh_token,
  });

  const messages = await getThreadMessages(body.threadId, gmail);

  logger.info("Fetched messages", {
    userId: body.userId,
    threadId: body.threadId,
    messageCount: messages.length,
  });

  if (!messages.length) return;
  // don't archive convos - TODO: handle with ai
  if (messages.length > 1) return;

  // fixed logic
  // check if has unsub link
  // check if newsletter
  // check if receipt
  // check if calendar invite
  // check if promotion/social/update
  // handle with ai

  const aiResult = await aiClean({
    user,
    messages: messages.map((m) => getEmailForLLM(m)),
  });

  // max rate:
  // https://developers.google.com/gmail/api/reference/quota
  // 15,000 quota units per user per minute
  // modify thread = 10 units
  // => 1,500 modify threads per minute
  // => 25 modify threads per second
  // => assume user has other actions too => max 12 per second
  const actionCount = 2; // 1. remove "inbox" label. 2. label "clean". increase if we're doing multiple labellings
  const maxRatePerSecond = Math.ceil(12 / actionCount);

  const cleanGmailBody: CleanGmailBody = {
    userId: body.userId,
    threadId: body.threadId,
    archive: aiResult.archive,
    // label: aiResult.label,
    archiveLabelId: body.archiveLabelId,
    processedLabelId: body.processedLabelId,
  };

  logger.info("Publishing to Qstash", {
    userId: body.userId,
    threadId: body.threadId,
    maxRatePerSecond,
  });

  await publishToQstash("/api/clean/gmail", cleanGmailBody, {
    key: `gmail-action-${body.userId}`,
    ratePerSecond: maxRatePerSecond,
  });

  logger.info("Published to Qstash", {
    userId: body.userId,
    threadId: body.threadId,
  });
}

// TODO: security
export const POST = withError(async (request: Request) => {
  const json = await request.json();
  const body = cleanThreadBody.parse(json);

  await cleanThread(body);

  return NextResponse.json({ success: true });
});
