import "server-only";
import parse from "gmail-api-parse-message";
import EmailReplyParser from "email-reply-parser";
import { convert } from "html-to-text";
import type {
  ThreadWithPayloadMessages,
  MessageWithPayload,
  ParsedMessage,
} from "@/utils/types";
import { removeExcessiveWhitespace, truncate } from "@/utils/string";
import { GmailLabel } from "@/utils/gmail/label";
import { isIgnoredSender } from "@/utils/filter-ignored-senders";

export function parseMessage(
  message: MessageWithPayload,
): ParsedMessage & { subject: string; date: string } {
  const parsed = parse(message) as ParsedMessage;
  return {
    ...parsed,
    subject: parsed.headers?.subject || "",
    date: parsed.headers?.date || "",
  };
}

export function parseReply(plainText: string) {
  const parser = new EmailReplyParser().read(plainText);
  const result = parser.getVisibleText();
  return result;
}

export function parseMessages(
  thread: ThreadWithPayloadMessages,
  {
    withoutIgnoredSenders,
    withoutDrafts,
  }: {
    withoutIgnoredSenders?: boolean;
    withoutDrafts?: boolean;
  } = {},
) {
  const messages =
    thread.messages?.map((message: MessageWithPayload) => {
      return parseMessage(message);
    }) || [];

  if (withoutIgnoredSenders || withoutDrafts) {
    const filteredMessages = messages.filter((message) => {
      if (
        withoutIgnoredSenders &&
        message.headers &&
        isIgnoredSender(message.headers.from)
      )
        return false;
      if (withoutDrafts && message.labelIds?.includes(GmailLabel.DRAFT))
        return false;
      return true;
    });
    return filteredMessages;
  }

  return messages;
}

// important to do before processing html emails
// this will cut down an email from 100,000 characters to 1,000 characters in some cases
function htmlToText(html: string, removeLinks = true, removeImages = true) {
  const text = convert(html, {
    wordwrap: 130,
    // this removes links and images.
    // might want to change this in the future if we're searching for links like Unsubscribe
    selectors: [
      ...(removeLinks
        ? [{ selector: "a", options: { ignoreHref: true } }]
        : []),
      ...(removeImages ? [{ selector: "img", format: "skip" }] : []),
    ],
  });

  return text;
}

export function getEmailClient(messageId: string) {
  if (messageId.includes("mail.gmail.com")) return "gmail";
  if (messageId.includes("we.are.superhuman.com")) return "superhuman";
  if (messageId.includes("mail.shortwave.com")) return "shortwave";

  // take part after @ and remove final >
  const emailClient = messageId.split("@")[1].split(">")[0];
  return emailClient;
}

function removeForwardedContent(text: string): string {
  const forwardPatterns = [
    // Gmail style
    /(?:\r?\n|\r)?(?:-{3,}|_{3,})\s*Forwarded message\s*(?:-{3,}|_{3,})/i,
    // Simple forward markers
    /(?:\r?\n|\r)?(?:-{3,}|_{3,})\s*Forward(?:ed)?(?:\s*message)?(?:-{3,}|_{3,})/i,
    // Email headers
    /(?:\r?\n|\r)?From:[\s\S]*?Subject:/m,
    // iOS/Mac style
    /(?:\r?\n|\r)?Begin forwarded message:/im,
    // Outlook style
    /(?:\r?\n|\r)?Original Message/i,
  ];

  for (const pattern of forwardPatterns) {
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
};

export function emailToContent(
  email: Pick<ParsedMessage, "textHtml" | "textPlain" | "snippet">,
  {
    maxLength = 2000,
    extractReply = false,
    removeForwarded = false,
  }: EmailToContentOptions = {},
): string {
  let content = "";

  if (email.textHtml) {
    content = htmlToText(email.textHtml);
  } else if (email.textPlain) {
    content = email.textPlain;
  } else if (email.snippet) {
    content = email.snippet;
  }

  if (extractReply) {
    content = parseReply(content);
  }

  if (removeForwarded) {
    content = removeForwardedContent(content);
  }

  content = removeExcessiveWhitespace(content);

  return maxLength ? truncate(content, maxLength) : content;
}

export function convertEmailHtmlToText({
  htmlText,
}: {
  htmlText: string;
}): string {
  const plainText = convert(htmlText, {
    wordwrap: 130,
    selectors: [
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      { selector: "img", format: "skip" },
    ],
  });

  return plainText;
}
