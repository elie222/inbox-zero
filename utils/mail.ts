import "server-only";
import parse from "gmail-api-parse-message";
import { gmail_v1 } from "googleapis";
import { ParsedMessage } from "@/utils/types";

export function parseMessage(message: gmail_v1.Schema$Message): ParsedMessage {
  return parse(message);
}

export function parseMessages(thread: gmail_v1.Schema$Thread) {
  const messages =
    thread.messages?.map((message) => {
      return {
        ...message,
        parsedMessage: parseMessage(message),
        // text: message.payload?.parts?.[0]?.body?.data ? decodeMessage(message.payload?.parts?.[0]?.body?.data) : ''
      };
    }) || [];

  return messages;
}
