import type { gmail_v1 } from "@googleapis/gmail";
import type { Prisma } from "@prisma/client";

// https://stackoverflow.com/a/53276873/2602771
export type PartialRecord<K extends keyof any, T> = Partial<Record<K, T>>;

// type guard for filters that removed undefined and null values
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

export type RuleWithActions = Prisma.RuleGetPayload<{
  include: { actions: true };
}>;

export type RuleWithActionsAndCategories = Prisma.RuleGetPayload<{
  include: { actions: true; categoryFilters: true };
}>;

export type AIRuleWithActionsAndCategories = RuleWithActionsAndCategories & {
  instructions: string;
};

export type BatchError = {
  error: {
    code: number;
    message: string;
    errors: any[][];
    status: string;
  };
};

export function isBatchError(
  message: MessageWithPayload | BatchError,
): message is BatchError {
  return (message as BatchError).error !== undefined;
}

export type MessageWithPayload = gmail_v1.Schema$Message & {
  payload: gmail_v1.Schema$MessagePart;
};

export type ThreadWithPayloadMessages = gmail_v1.Schema$Thread & {
  messages: MessageWithPayload[];
};

export interface ParsedMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet: string;
  historyId: string;
  attachments?: Attachment[];
  inline: Inline[];
  headers: ParsedMessageHeaders;
  textPlain?: string;
  textHtml?: string;
  subject: string;
  date: string;
  conversationIndex?: string | null;
  internalDate?: string | null;
}

export interface Attachment {
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

export interface ParsedMessageHeaders {
  subject: string;
  from: string;
  to: string;
  cc?: string;
  bcc?: string;
  date: string; // the date supplied by the email. internally we rely on message.internalDate provided by the gmail api
  "message-id"?: string;
  "reply-to"?: string;
  "in-reply-to"?: string;
  references?: string;
  "list-unsubscribe"?: string;
}

export type EmailForLLM = {
  id: string;
  from: string;
  to: string;
  replyTo?: string;
  cc?: string;
  subject: string;
  content: string;
  date?: Date;
};
