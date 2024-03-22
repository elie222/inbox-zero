import "server-only";
import parse from "gmail-api-parse-message";
import replyParser from "node-email-reply-parser";
import { convert } from "html-to-text";
import {
  type ThreadWithPayloadMessages,
  type MessageWithPayload,
  type ParsedMessage,
} from "@/utils/types";

export function parseMessage(message: MessageWithPayload): ParsedMessage {
  return parse(message);
}

// if the email content contains a lot of replies this parses it and finds the content from the last message
export function parseReply(content: string) {
  const email = replyParser(content);
  return email.getVisibleText();
}

export function parseMessages(thread: ThreadWithPayloadMessages) {
  const messages =
    thread.messages?.map((message: MessageWithPayload) => {
      const parsedMessage = parseMessage(message);
      return {
        // ...message,
        id: message.id,
        threadId: message.threadId,
        labelIds: message.labelIds,
        snippet: message.snippet,
        internalDate: message.internalDate,
        parsedMessage,
        // parsedReply: parseReply(
        //   parsedMessage.textPlain || parsedMessage.textHtml
        // ),
        // text: message.payload?.parts?.[0]?.body?.data ? decodeMessage(message.payload?.parts?.[0]?.body?.data) : ''
      };
    }) || [];

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

export function truncate(str: string, length: number) {
  return str.length > length ? str.slice(0, length) + "..." : str;
}

// extract replies can sometimes return no content.
// as we don't run ai on threads with multiple messages, 'extractReply' can be disabled for now
export function parseEmail(
  html: string,
  extractReply = false,
  maxLength: number | null = 2000,
) {
  // 1. remove replies
  // 2. remove html
  // 3. truncate

  const text = htmlToText(extractReply ? parseReply(html) : html);
  const truncatedText = maxLength === null ? text : truncate(text, maxLength);

  return truncatedText;
}

export function getEmailClient(messageId: string) {
  if (messageId.includes("mail.gmail.com")) return "gmail";
  if (messageId.includes("we.are.superhuman.com")) return "superhuman";
  if (messageId.includes("mail.shortwave.com")) return "shortwave";

  // take part after @ and remove final >
  const emailClient = messageId.split("@")[1].split(">")[0];
  return emailClient;
}
