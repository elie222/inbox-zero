import { truncate } from "@/utils/string";

export type EmailForLLM = {
  from: string;
  replyTo?: string;
  cc?: string;
  subject: string;
  content: string;
};

export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  return (
    `From: ${email.from}` +
    `${email.replyTo ? `\nReply to: ${email.replyTo}` : ""}` +
    `${email.cc ? `\nCC: ${email.cc}` : ""}` +
    `\nSubject: ${email.subject}` +
    `\nBody: ${truncate(email.content, maxLength)}`
  );
}
