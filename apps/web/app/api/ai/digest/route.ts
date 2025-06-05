import { withError } from "@/utils/middleware";
import { getEmailAccountWithAi } from "@/utils/user/get";
import { digestBody } from "@/app/api/ai/digest/validation";
import { NextResponse } from "next/server";
import { aiSummarizeEmailForDigest } from "@/utils/ai/digest/summarize-email-for-digest";
import { upsertDigest } from "@/utils/digest/index";

export async function handleDigestRequest(request: Request) {
  const json = await request.json();
  const body = digestBody.parse(json);
  const emailAccount = await getEmailAccountWithAi({
    emailAccountId: body.emailAccountId,
  });

  if (!emailAccount) {
    return NextResponse.json(
      { error: "Email account not found" },
      { status: 404 },
    );
  }

  const aiActionResult = await aiSummarizeEmailForDigest({
    emailAccount,
    messageToSummarize: {
      id: body.message.messageId,
      from: body.message.from,
      to: body.message.to,
      subject: body.message.subject,
      content: body.message.content,
    },
  });

  const summary = aiActionResult.summary;

  if (!summary) {
    return NextResponse.json(
      { error: "Failed to summarize email" },
      { status: 500 },
    );
  }

  await upsertDigest({
    messageId: body.message.messageId,
    threadId: body.message.threadId,
    emailAccountId: body.emailAccountId,
    actionId: body.actionId,
    summary,
  });

  return NextResponse.json({ success: true });
}

export const POST = withError(handleDigestRequest);
