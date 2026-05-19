import "server-only";
import EmailReplyParser from "email-reply-parser";
import { convert, type FormatCallback } from "html-to-text";
import type { ParsedMessage } from "@/utils/types";
import { removeExcessiveWhitespace, truncate } from "@/utils/string";
import { env } from "@/env";
import { SafeError } from "@/utils/error";

export function parseReply(plainText: string) {
  const parser = new EmailReplyParser().read(plainText);
  const result = parser.getVisibleText();
  return result;
}

const IMAGE_ALT_MAX_LENGTH = 160;
const IMAGE_PLACEHOLDER = "[image]";
const GENERIC_IMAGE_ALT_TEXT_PATTERN =
  /^(?:avatar|decorative|graphic|icon|image|img|logo|photo|picture|pixel|spacer|tracking pixel)$/i;

// important to do before processing html emails
// this will cut down an email from 100,000 characters to 1,000 characters in some cases
function htmlToText(
  html: string,
  {
    includeLinkUrls = false,
    includeImageAltText = false,
  }: Pick<
    EmailToContentOptions,
    "includeLinkUrls" | "includeImageAltText"
  > = {},
) {
  const text = convert(html, {
    wordwrap: 130,
    formatters: { imageAltText: formatImageAltText },
    selectors: [
      {
        selector: "a",
        options: includeLinkUrls
          ? { hideLinkHrefIfSameAsText: true }
          : { ignoreHref: true },
      },
      {
        selector: "img",
        format: includeImageAltText ? "imageAltText" : "skip",
      },
    ],
  });

  return text;
}

const formatImageAltText: FormatCallback = (elem, _walk, builder) => {
  builder.addInline(getImageText(elem.attribs?.alt), {
    noWordTransform: true,
  });
};

function getImageText(value: unknown) {
  if (typeof value !== "string") return IMAGE_PLACEHOLDER;

  const altText = removeExcessiveWhitespace(value).trim();
  if (!altText) return IMAGE_PLACEHOLDER;
  if (GENERIC_IMAGE_ALT_TEXT_PATTERN.test(altText)) return IMAGE_PLACEHOLDER;

  return `[image: ${truncate(altText, IMAGE_ALT_MAX_LENGTH)}]`;
}

export function getEmailClient(messageId: string) {
  if (messageId.includes("mail.gmail.com")) return "gmail";
  if (messageId.includes("we.are.superhuman.com")) return "superhuman";
  if (messageId.includes("mail.shortwave.com")) return "shortwave";

  // take part after @ and remove final >
  const emailClient = messageId.split("@")[1].split(">")[0];
  return emailClient;
}

const FORWARDED_CONTENT_PATTERNS = [
  // Gmail style
  /(?:\r?\n|\r)?(?:-{3,}|_{3,})\s*Forwarded message\s*(?:-{3,}|_{3,})/i,
  // Simple forward markers
  /(?:\r?\n|\r)?(?:-{3,}|_{3,})\s*Forward(?:ed)?(?:\s*message)?(?:-{3,}|_{3,})/i,
  // Forwarded email header blocks
  /(?:^|\r?\n)From:\s*[^\r\n]+(?:\r?\n(?:Date|Sent|To|Cc|Bcc|Subject):\s*[^\r\n]+){2,}/im,
  // iOS/Mac style
  /(?:\r?\n|\r)?Begin forwarded message:/im,
  // Outlook style
  /(?:\r?\n|\r)?Original Message/i,
];

export function stripForwardedContent(text: string): string {
  for (const pattern of FORWARDED_CONTENT_PATTERNS) {
    const parts = text.split(pattern);
    if (parts.length > 1) {
      // Take content before the forward marker and clean it
      return removeExcessiveWhitespace(parts[0]);
    }
  }

  return text;
}

export type EmailToContentOptions = {
  maxLength?: number;
  extractReply?: boolean;
  removeForwarded?: boolean;
  includeLinkUrls?: boolean;
  includeImageAltText?: boolean;
};

export function emailToContent(
  email: Pick<ParsedMessage, "textHtml" | "textPlain" | "snippet">,
  {
    maxLength = 2000,
    extractReply = false,
    removeForwarded = false,
    includeLinkUrls = false,
    includeImageAltText = false,
  }: EmailToContentOptions = {},
): string {
  let content = "";

  if (email.textHtml) {
    content = htmlToText(email.textHtml, {
      includeLinkUrls,
      includeImageAltText,
    });
  } else if (email.textPlain) {
    content = email.textPlain;
  } else if (email.snippet) {
    content = email.snippet;
  }

  if (extractReply) {
    content = parseReply(content);
  }

  if (removeForwarded) {
    content = stripForwardedContent(content);
  }

  content = removeExcessiveWhitespace(content);

  return maxLength ? truncate(content, maxLength) : content;
}

export function convertEmailHtmlToText({
  htmlText,
  includeLinks = true,
}: {
  htmlText: string;
  includeLinks?: boolean;
}): string {
  const plainText = convert(htmlText, {
    wordwrap: 130,
    selectors: [
      {
        selector: "a",
        options: includeLinks
          ? { hideLinkHrefIfSameAsText: true } // Keep link URLs: "Text [URL]"
          : { ignoreHref: true }, // Remove links entirely: "Text"
      },
      { selector: "img", format: "skip" },
    ],
  });

  return plainText;
}

/**
 * Ensures email sending is enabled. Throws an error if disabled.
 * @throws {SafeError} If email sending is disabled
 */
export function ensureEmailSendingEnabled(): void {
  if (!env.NEXT_PUBLIC_EMAIL_SEND_ENABLED) {
    throw new SafeError(
      "Email sending is disabled. Set NEXT_PUBLIC_EMAIL_SEND_ENABLED=true to enable.",
    );
  }
}
