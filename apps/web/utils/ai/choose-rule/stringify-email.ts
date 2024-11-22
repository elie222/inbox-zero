import { truncate } from "@/utils/string";

export type EmailForLLM = {
  from: string;
  replyTo?: string;
  cc?: string;
  subject: string;
  content: string;
};

export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  const emailParts = [
    `<from>${email.from}</from>`,
    email.replyTo && `<replyTo>${email.replyTo}</replyTo>`,
    email.cc && `<cc>${email.cc}</cc>`,
    `<subject>${email.subject}</subject>`,
    `<body>${truncate(email.content, maxLength)}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}
