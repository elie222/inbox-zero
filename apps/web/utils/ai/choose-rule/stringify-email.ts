import { truncate } from "@/utils/string";

export type EmailForLLM = {
  from: string;
  replyTo?: string;
  cc?: string;
  subject: string;
  content: string;
};

export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  return `From: ${email.from}
${email.replyTo ? `Reply to: ${email.replyTo}` : ""}
${email.cc ? `CC: ${email.cc}` : ""}
Subject: ${email.subject}
Body:
${truncate(email.content, maxLength)}`;
}
