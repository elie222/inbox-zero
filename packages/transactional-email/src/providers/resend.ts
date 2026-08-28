import { Resend } from "resend";
import type {
  TransactionalEmailProvider,
  TransactionalEmailProviderResult,
} from "../provider";

export function createResendTransactionalEmailProvider(
  apiKey: string,
): TransactionalEmailProvider {
  const resend = new Resend(apiKey);

  return {
    async send(message, options): Promise<TransactionalEmailProviderResult> {
      const result = await resend.emails.send(
        {
          attachments: message.attachments,
          from: message.from,
          headers: message.headers,
          html: message.html,
          replyTo: message.replyTo,
          subject: message.subject,
          tags: message.tags,
          text: message.text,
          to: options?.test ? "delivered@resend.dev" : message.to,
        },
        options?.idempotencyKey
          ? { idempotencyKey: options.idempotencyKey }
          : undefined,
      );

      if (result.error) {
        throw new Error(`Error sending email: ${result.error.message}`);
      }

      return { messageId: result.data?.id };
    },
  };
}
