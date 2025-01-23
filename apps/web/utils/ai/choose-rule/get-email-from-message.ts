import type { ParsedMessage, EmailForLLM } from "@/utils/types";
import { emailToContent } from "@/utils/mail";

export function getEmailForLLM(message: ParsedMessage): EmailForLLM {
  return {
    from: message.headers.from,
    replyTo: message.headers["reply-to"],
    cc: message.headers.cc,
    subject: message.headers.subject,
    content: emailToContent(message),
  };
}
