import { NextResponse } from "next/server";
import { digestBody } from "./validation";
import { DigestStatus } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { RuleName } from "@/utils/rule/consts";
import { getRuleNameByExecutedAction } from "@/utils/actions/rule";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { upsertDigest } from "@/utils/digest/index";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";

export async function POST(request: Request) {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: api/ai/digest"));
    return new Response("Unauthorized", { status: 401 });
  }
  const body = digestBody.parse(await request.json());
  const { emailAccountId, coldEmailId, actionId, message } = body;

  const logger = createScopedLogger("digest").with({
    emailAccountId,
    messageId: message.id,
  });

  try {
    const emailAccount = await getEmailAccountWithAi({ emailAccountId });
    if (!emailAccount) {
      throw new Error("Email account not found");
    }

    const ruleName =
      (actionId && (await getRuleNameByExecutedAction(actionId))) ||
      RuleName.ColdEmail;
    const summary = await aiSummarizeEmailForDigest({
      ruleName: ruleName,
      emailAccount,
      messageToSummarize: message,
    });

    await upsertDigest({
      messageId: message.id || "",
      threadId: message.threadId || "",
      emailAccountId,
      actionId: actionId === undefined ? undefined : actionId,
      coldEmailId: coldEmailId === undefined ? undefined : coldEmailId,
      content: summary,
    });

    return new NextResponse("OK", { status: 200 });
  } catch (error) {
    logger.error("Failed to process digest", { error });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
