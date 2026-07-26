import { NextResponse } from "next/server";
import { z } from "zod";
import { withEmailProvider } from "@/utils/middleware";
import { forwardMessage } from "@/utils/email/forward-message";

const bodySchema = z.object({
  messageId: z.string().trim().min(1),
  to: z.string().trim().min(1),
  cc: z.string().nullish(),
  bcc: z.string().nullish(),
  content: z.string().nullish(),
});

export type ForwardMessageResponse = {
  success: true;
  threadId: string;
};

/**
 * REST equivalent of the assistant's forward action for clients that cannot
 * call server actions. Unlike `POST /api/messages/send` this re-fetches the
 * original attachments and builds the forwarded subject and quoted body
 * server-side, so the caller only supplies recipients and an optional comment.
 */
export const POST = withEmailProvider("messages/forward", async (request) => {
  const { messageId, to, cc, bcc, content } = bodySchema.parse(
    await request.json(),
  );

  const message = await request.emailProvider.getMessage(messageId);

  await forwardMessage({
    emailProvider: request.emailProvider,
    emailAccountId: request.auth.emailAccountId,
    message,
    to,
    cc,
    bcc,
    content,
  });

  return NextResponse.json({
    success: true,
    threadId: message.threadId,
  } satisfies ForwardMessageResponse);
});
