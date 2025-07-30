import { removeExcessiveWhitespace, truncate } from "@/utils/string";
import type { EmailForLLM } from "@/utils/types";

export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  // not sure we need to do truncate/removeExcessiveWhitespace here as `emailToContent` will do this. but need to make sure it's always called
  const emailParts = [
    `<from>${email.from}</from>`,
    email.replyTo && `<replyTo>${email.replyTo}</replyTo>`,
    email.to && `<to>${email.to}</to>`,
    email.cc && `<cc>${email.cc}</cc>`,
    email.date && `<date>${email.date.toISOString()}</date>`,
    `<subject>${email.subject}</subject>`,
    `<body>${truncate(removeExcessiveWhitespace(email.content), maxLength)}</body>`,
  ];

  if (email.attachments && email.attachments.length > 0) {
    const attachmentsXml = email.attachments
      .map(
        (att) =>
          `<attachment filename="${att.filename}" type="${att.mimeType}" size="${att.size}" />`,
      )
      .join("\n");
    emailParts.push(`<attachments>\n${attachmentsXml}\n</attachments>`);
  }

  return emailParts.filter(Boolean).join("\n");
}

export function stringifyEmailSimple(email: EmailForLLM) {
  const emailParts = [
    `<from>${email.from}</from>`,
    `<subject>${email.subject}</subject>`,
    `<body>${email.content}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}

export function stringifyEmailFromBody(email: EmailForLLM) {
  const emailParts = [
    `<from>${email.from}</from>`,
    `<body>${email.content}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}
