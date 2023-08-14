import "server-only";
import parse from "gmail-api-parse-message";
import {
  type ThreadWithPayloadMessages,
  type MessageWithPayload,
  type ParsedMessage,
} from "@/utils/types";

export function parseMessage(message: MessageWithPayload): ParsedMessage {
  return parse(message);
}

export function parseMessages(thread: ThreadWithPayloadMessages) {
  const messages =
    thread.messages?.map((message: MessageWithPayload) => {
      return {
        ...message,
        parsedMessage: parseMessage(message),
        // text: message.payload?.parts?.[0]?.body?.data ? decodeMessage(message.payload?.parts?.[0]?.body?.data) : ''
      };
    }) || [];

  return messages;
}
