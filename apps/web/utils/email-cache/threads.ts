import type { ThreadResponse } from "@/app/api/threads/[id]/route";
import type {
  Attachment,
  ParsedMessage,
  ParsedMessageHeaders,
} from "@/utils/types";
import { sortByInternalDate } from "@/utils/date";
import { scheduleEmailCacheCleanup } from "./cleanup";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { EMAIL_CACHE_MAX_AGE_MS } from "./policy";

export type CachedThreadDetail = {
  byteSize: number;
  cachedAt: number;
  data: ThreadResponse;
};

export async function writeCachedThreadDetail({
  emailAccountId,
  threadId,
  variant,
  data,
  now = Date.now(),
}: {
  emailAccountId: string;
  threadId: string;
  variant: string;
  data: ThreadResponse;
  now?: number;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);
  const sanitized = sanitizeThreadResponse(data);
  const byteSize = getThreadResponseByteSize(sanitized);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    await database.put("threadDetails", {
      emailAccountId,
      threadId,
      variant,
      data: sanitized,
      fetchedAt: now,
      lastAccessedAt: now,
      byteSize,
    });
    scheduleEmailCacheCleanup();
  } catch {
    scheduleEmailCacheCleanup({ force: true });
    // Cache writes are best-effort and must never affect thread rendering.
  }
}

export async function readCachedThreadDetail({
  emailAccountId,
  threadId,
  variant,
}: {
  emailAccountId: string;
  threadId: string;
  variant: string;
}): Promise<CachedThreadDetail | undefined> {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = database.transaction("threadDetails", "readwrite");
    const store = transaction.objectStore("threadDetails");
    const record = await store.get([emailAccountId, threadId, variant]);
    if (!record) {
      await transaction.done;
      return;
    }
    if (Date.now() - record.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) {
      await transaction.done;
      scheduleEmailCacheCleanup();
      return;
    }

    const now = Date.now();
    const sanitized = sanitizeThreadResponse(record.data as ThreadResponse);
    const byteSize = getThreadResponseByteSize(sanitized);

    await store.put({
      ...record,
      data: sanitized,
      lastAccessedAt: now,
      byteSize,
    });
    await transaction.done;
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    scheduleEmailCacheCleanup();
    return {
      data: sanitized,
      cachedAt: record.fetchedAt,
      byteSize,
    };
  } catch {
    return;
  }
}

function sanitizeThreadResponse(data: ThreadResponse): ThreadResponse {
  return {
    thread: {
      historyId: data.thread.historyId,
      id: data.thread.id,
      // Records survive for as long as EMAIL_CACHE_MAX_AGE_MS and carry no
      // schema version, so a payload written by an older client is replayed
      // exactly as it was stored. Ordering is the reader's contract, not the
      // stored payload's, so re-establish it rather than trusting the record.
      messages: data.thread.messages
        .map(sanitizeMessage)
        .sort(sortByInternalDate()),
      snippet: data.thread.snippet,
    },
  };
}

function sanitizeMessage(message: ParsedMessage): ParsedMessage {
  return {
    attachments: message.attachments?.map(sanitizeAttachment),
    bodyContentType: message.bodyContentType,
    conversationIndex: message.conversationIndex,
    date: message.date,
    externalUrl: message.externalUrl,
    headers: sanitizeHeaders(message.headers),
    historyId: message.historyId,
    id: message.id,
    inline: message.inline.map(sanitizeInlineAttachment),
    internalDate: message.internalDate,
    labelIds: message.labelIds ? [...message.labelIds] : undefined,
    parentFolderId: message.parentFolderId,
    rawRecipients: message.rawRecipients,
    snippet: message.snippet,
    subject: message.subject,
    textHtml: message.textHtml,
    textPlain: message.textPlain,
    threadId: message.threadId,
  };
}

function sanitizeAttachment(attachment: Attachment): Attachment {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    headers: {
      "content-description": attachment.headers["content-description"],
      "content-disposition": attachment.headers["content-disposition"],
      "content-id": attachment.headers["content-id"],
      "content-transfer-encoding":
        attachment.headers["content-transfer-encoding"],
      "content-type": attachment.headers["content-type"],
    },
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

function sanitizeInlineAttachment(
  attachment: ParsedMessage["inline"][number],
): ParsedMessage["inline"][number] {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    headers: {
      "content-description": attachment.headers["content-description"],
      "content-id": attachment.headers["content-id"],
      "content-transfer-encoding":
        attachment.headers["content-transfer-encoding"],
      "content-type": attachment.headers["content-type"],
    },
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

function sanitizeHeaders(headers: ParsedMessageHeaders): ParsedMessageHeaders {
  return {
    bcc: headers.bcc,
    cc: headers.cc,
    date: headers.date,
    from: headers.from,
    "in-reply-to": headers["in-reply-to"],
    "list-unsubscribe": headers["list-unsubscribe"],
    "message-id": headers["message-id"],
    references: headers.references,
    "reply-to": headers["reply-to"],
    subject: headers.subject,
    to: headers.to,
  };
}

function getThreadResponseByteSize(data: ThreadResponse) {
  return new Blob([JSON.stringify(data)]).size;
}
