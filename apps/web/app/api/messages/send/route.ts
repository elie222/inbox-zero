import { NextResponse } from "next/server";
import { withEmailProvider } from "@/utils/middleware";
import { sendEmailBody } from "@/utils/types/mail";
import { executeDurableEmailSend } from "@/utils/email/durable-email-send";
import { durableEmailSendBody } from "@/utils/email/durable-email-send.validation";

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
  const json: unknown = await request.json();
  if (isDurableSend(json)) {
    const input = durableEmailSendBody.parse(json);
    const result = await executeDurableEmailSend({
      emailAccountId: request.auth.emailAccountId,
      getEmailProvider: async () => request.emailProvider,
      input,
      provider: request.emailProvider.name,
    });
    return NextResponse.json(result);
  }
  const body = sendEmailBody.parse(json);

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

function isDurableSend(value: unknown): value is { mutationId: unknown } {
  return typeof value === "object" && value !== null && "mutationId" in value;
}
