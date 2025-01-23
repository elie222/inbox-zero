import { removeExcessiveWhitespace, truncate } from "@/utils/string";
import type { EmailForLLM } from "@/utils/types";
export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  const emailParts = [
    `<from>${email.from}</from>`,
    email.replyTo && `<replyTo>${email.replyTo}</replyTo>`,
    email.cc && `<cc>${email.cc}</cc>`,
    `<subject>${email.subject}</subject>`,
    `<body>${truncate(removeExcessiveWhitespace(email.content), maxLength)}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}
