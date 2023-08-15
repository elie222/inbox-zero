import "server-only";
import parse from "gmail-api-parse-message";
import replyParser from "node-email-reply-parser";
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
        ...message,
        parsedMessage,
        // parsedReply: parseReply(
        //   parsedMessage.textPlain || parsedMessage.textHtml
        // ),
        // text: message.payload?.parts?.[0]?.body?.data ? decodeMessage(message.payload?.parts?.[0]?.body?.data) : ''
      };
    }) || [];

  return messages;
}
