import "server-only";
import parse from "gmail-api-parse-message";
import { gmail_v1 } from "googleapis";

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

interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  historyId: string;
  internalDate: number;
  attachments: Attachment[];
  inline: Inline[];
  headers: Headers3;
  textPlain: string;
  textHtml: string;
}

interface Attachment {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  headers: Headers;
}

interface Headers {
  "content-type": string;
  "content-description": string;
  "content-transfer-encoding": string;
  "content-id": string;
}

interface Inline {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string;
  headers: Headers2;
}

interface Headers2 {
  "content-type": string;
  "content-description": string;
  "content-transfer-encoding": string;
  "content-id": string;
}

interface Headers3 {
  subject: string;
  from: string;
  to: string;
  cc?: string;
  date: string;
  [key: string]: string | undefined;
}
