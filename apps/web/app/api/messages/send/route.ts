import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { sendEmailBody } from "@/utils/gmail/mail";

export type SendMessageResponse = {
  success: true;
  messageId: string;
  threadId: string;
};

/**
 * REST equivalent of `sendEmailAction` for clients that cannot call server
 * actions (e.g. the mobile app). Accepts the same `sendEmailBody` payload:
 * pass `replyToEmail` (threadId + headerMessageId + references) to reply on
 * an existing thread, or omit it to send a new email.
 */
export const POST = withEmailProvider("messages/send", async (request) => {
  const body = sendEmailBody.parse(await request.json());

  try {
    const result = await request.emailProvider.sendEmailWithHtml(body);

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    } satisfies SendMessageResponse);
  } catch (error) {
    request.logger.error("Failed to send email", {
      error,
      threadId: body.replyToEmail?.threadId,
      emailAccountId: request.auth.emailAccountId,
    });
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 },
    );
  }
});
