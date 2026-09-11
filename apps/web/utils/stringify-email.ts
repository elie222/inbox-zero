import {
  escapeHtml,
  removeExcessiveWhitespace,
  truncate,
} from "@/utils/string";
import type { EmailForLLM } from "@/utils/types";

// Email fields are attacker-controlled. Escape them before interpolating into
// the XML-style delimiters so crafted content (e.g. "</body></email>...") can't
// break out of its tag and be read by the model as out-of-band instructions.
export function stringifyEmail(email: EmailForLLM, maxLength: number) {
  // not sure we need to do truncate/removeExcessiveWhitespace here as `emailToContent` will do this. but need to make sure it's always called
  const emailParts = [
    `<from>${escapeHtml(email.from)}</from>`,
    email.replyTo && `<replyTo>${escapeHtml(email.replyTo)}</replyTo>`,
    email.to && `<to>${escapeHtml(email.to)}</to>`,
    email.cc && `<cc>${escapeHtml(email.cc)}</cc>`,
    email.date && `<date>${email.date.toISOString()}</date>`,
    `<subject>${escapeHtml(email.subject)}</subject>`,
    // Escape last, after truncation, so an entity is never split mid-sequence.
    `<body>${escapeHtml(truncate(removeExcessiveWhitespace(email.content), maxLength))}</body>`,
  ];

  if (email.attachments && email.attachments.length > 0) {
    const attachmentsXml = email.attachments
      .map(
        (att) =>
          `<attachment filename="${escapeHtml(att.filename)}" type="${escapeHtml(att.mimeType)}" size="${att.size}" />`,
      )
      .join("\n");
    emailParts.push(`<attachments>\n${attachmentsXml}\n</attachments>`);
  }

  return emailParts.filter(Boolean).join("\n");
}

export function stringifyEmailSimple(email: EmailForLLM) {
  const emailParts = [
    `<from>${escapeHtml(email.from)}</from>`,
    `<subject>${escapeHtml(email.subject)}</subject>`,
    `<body>${escapeHtml(email.content)}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}

export function stringifyEmailFromBody(email: EmailForLLM) {
  const emailParts = [
    `<from>${escapeHtml(email.from)}</from>`,
    `<body>${escapeHtml(email.content)}</body>`,
  ];

  return emailParts.filter(Boolean).join("\n");
}
