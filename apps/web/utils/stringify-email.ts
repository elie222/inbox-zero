import { removeExcessiveWhitespace, truncate } from "@/utils/string";
import type { EmailForLLM } from "@/utils/types";
import { sanitizeEmailContent } from "@/utils/ai/guardrails";

export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  // Sanitize content to mitigate prompt injection risks
  const sanitizedContent = sanitizeEmailContent(email.content);
  const sanitizedSubject = sanitizeEmailContent(email.subject);

  // not sure we need to do truncate/removeExcessiveWhitespace here as `emailToContent` will do this. but need to make sure it's always called
  const emailParts = [
    `<from>${email.from}</from>`,
    email.replyTo && `<replyTo>${email.replyTo}</replyTo>`,
    email.to && `<to>${email.to}</to>`,
    email.cc && `<cc>${email.cc}</cc>`,
    email.date && `<date>${email.date.toISOString()}</date>`,
    `<subject>${sanitizedSubject}</subject>`,
    `<body>${truncate(removeExcessiveWhitespace(sanitizedContent), maxLength)}</body>`,
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
  const sanitizedContent = sanitizeEmailContent(email.content);
  const sanitizedSubject = sanitizeEmailContent(email.subject);

  const emailParts = [
    `<from>${email.from}</from>`,
    `<subject>${sanitizedSubject}</subject>`,
    `<body>${sanitizedContent}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}

export function stringifyEmailFromBody(email: EmailForLLM) {
  const sanitizedContent = sanitizeEmailContent(email.content);

  const emailParts = [
    `<from>${email.from}</from>`,
    `<body>${sanitizedContent}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}
