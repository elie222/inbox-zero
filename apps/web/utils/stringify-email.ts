import { removeExcessiveWhitespace, truncate } from "@/utils/string";
import type { EmailForLLM } from "@/utils/types";
import { sanitizeEmailContent } from "@/utils/ai/guardrails";

export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  // Sanitize all fields to mitigate prompt injection risks
  // Header fields (from, to, cc, replyTo) can contain display names with arbitrary user-controllable text
  const sanitizedFrom = sanitizeEmailContent(email.from);
  const sanitizedReplyTo = email.replyTo
    ? sanitizeEmailContent(email.replyTo)
    : undefined;
  const sanitizedTo = email.to ? sanitizeEmailContent(email.to) : undefined;
  const sanitizedCc = email.cc ? sanitizeEmailContent(email.cc) : undefined;
  const sanitizedContent = sanitizeEmailContent(email.content);
  const sanitizedSubject = sanitizeEmailContent(email.subject);

  // not sure we need to do truncate/removeExcessiveWhitespace here as `emailToContent` will do this. but need to make sure it's always called
  const emailParts = [
    `<from>${sanitizedFrom}</from>`,
    sanitizedReplyTo && `<replyTo>${sanitizedReplyTo}</replyTo>`,
    sanitizedTo && `<to>${sanitizedTo}</to>`,
    sanitizedCc && `<cc>${sanitizedCc}</cc>`,
    email.date && `<date>${email.date.toISOString()}</date>`,
    `<subject>${sanitizedSubject}</subject>`,
    `<body>${truncate(removeExcessiveWhitespace(sanitizedContent), maxLength)}</body>`,
  ];

  if (email.attachments && email.attachments.length > 0) {
    const attachmentsXml = email.attachments
      .map((att) => {
        // Sanitize filename as it can contain user-controllable text
        const sanitizedFilename = sanitizeEmailContent(att.filename);
        const sanitizedMimeType = sanitizeEmailContent(att.mimeType);
        return `<attachment filename="${sanitizedFilename}" type="${sanitizedMimeType}" size="${att.size}" />`;
      })
      .join("\n");
    emailParts.push(`<attachments>\n${attachmentsXml}\n</attachments>`);
  }

  return emailParts.filter(Boolean).join("\n");
}

export function stringifyEmailSimple(email: EmailForLLM) {
  const sanitizedFrom = sanitizeEmailContent(email.from);
  const sanitizedContent = sanitizeEmailContent(email.content);
  const sanitizedSubject = sanitizeEmailContent(email.subject);

  const emailParts = [
    `<from>${sanitizedFrom}</from>`,
    `<subject>${sanitizedSubject}</subject>`,
    `<body>${sanitizedContent}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}

export function stringifyEmailFromBody(email: EmailForLLM) {
  const sanitizedFrom = sanitizeEmailContent(email.from);
  const sanitizedContent = sanitizeEmailContent(email.content);

  const emailParts = [
    `<from>${sanitizedFrom}</from>`,
    `<body>${sanitizedContent}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}
