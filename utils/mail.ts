import "server-only";
import parse from "gmail-api-parse-message";
import { type gmail_v1 } from "googleapis";
import { type MessageWithPayload, type ParsedMessage } from "@/utils/types";

export function parseMessage(message: MessageWithPayload): ParsedMessage {
  return parse(message);
}

export function parseMessages(thread: gmail_v1.Schema$Thread) {
  const messages =
    thread.messages?.map((message) => {
      if (!message.payload) return message;

      return {
        ...message,
        parsedMessage: parseMessage({ ...message, payload: message.payload }),
        // text: message.payload?.parts?.[0]?.body?.data ? decodeMessage(message.payload?.parts?.[0]?.body?.data) : ''
      };
    }) || [];

  return messages;
}
