import type { gmail_v1 } from "@googleapis/gmail";
import type { Prisma } from "@/generated/prisma/client";
import type {
  Recipient,
  NullableOption,
} from "@microsoft/microsoft-graph-types";

// https://stackoverflow.com/a/53276873/2602771
export type PartialRecord<K extends PropertyKey, T> = Partial<Record<K, T>>;

// type guard for filters that removed undefined and null values
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

export type RuleWithActions = Prisma.RuleGetPayload<{
  include: { actions: true };
}>;

export type BatchError = {
  error: {
    code: number;
    message: string;
    errors: Array<{
      message?: string;
      reason?: string;
    }>;
    status: string;
  };
};

export function isBatchError(
  message: MessageWithPayload | BatchError,
): message is BatchError {
  return (message as BatchError).error !== undefined;
}

export type MessageWithPayload = {
  historyId?: string | null;
  id?: string | null;
  internalDate?: string | null;
  labelIds?: string[] | null;
  raw?: string | null;
  sizeEstimate?: number | null;
  snippet?: string | null;
  threadId?: string | null;
  payload: gmail_v1.Schema$MessagePart;
};

export type ThreadWithPayloadMessages = gmail_v1.Schema$Thread & {
  messages: MessageWithPayload[];
};

export interface ParsedMessage {
  attachments?: Attachment[];
  bodyContentType?: "text" | "html"; // For Outlook: indicates which format the body was originally in
  conversationIndex?: string | null;
  date: string;
  headers: ParsedMessageHeaders;
  historyId: string;
  id: string;
  inline: Inline[];
  internalDate?: string | null;
  labelIds?: string[];
  parentFolderId?: string;
  // For Outlook: store raw recipient data to avoid double conversion
  rawRecipients?: {
    from?: NullableOption<Recipient>;
    toRecipients?: NullableOption<Recipient[]>;
    ccRecipients?: NullableOption<Recipient[]>;
  };
  snippet: string;
  subject: string;
  textHtml?: string;
  textPlain?: string;
  threadId: string;
}

export interface Attachment {
  attachmentId: string;
  filename: string;
  headers: Headers;
  mimeType: string;
  size: number;
}

interface Headers {
  "content-description": string;
  "content-id": string;
  "content-transfer-encoding": string;
  "content-type": string;
}

interface Inline {
  attachmentId: string;
  filename: string;
  headers: Headers2;
  mimeType: string;
  size: number;
}

interface Headers2 {
  "content-description": string;
  "content-id": string;
  "content-transfer-encoding": string;
  "content-type": string;
}

export interface ParsedMessageHeaders {
  bcc?: string;
  cc?: string;
  date: string; // the date supplied by the email. internally we rely on message.internalDate provided by the gmail api
  from: string;
  "in-reply-to"?: string;
  "list-unsubscribe"?: string;
  "message-id"?: string;
  references?: string;
  "reply-to"?: string;
  subject: string;
  to: string;
}

// Note: use `getEmailForLLM(message)` to convert a `ParsedMessage` to an `EmailForLLM`
export type EmailForLLM = {
  id: string;
  from: string;
  to: string;
  replyTo?: string;
  cc?: string;
  subject: string;
  content: string;
  date?: Date;
  listUnsubscribe?: string;
  attachments?: Array<{
    filename: string;
    mimeType: string;
    size: number;
  }>;
};
