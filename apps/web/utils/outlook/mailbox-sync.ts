import {
  type GraphRequest,
  RetryHandlerOptions,
} from "@microsoft/microsoft-graph-client";
import type { Message } from "@microsoft/microsoft-graph-types";
import {
  compactMailboxSyncMessage,
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
  InvalidMailboxSyncCursorError,
} from "@/utils/email/mailbox-sync";
import type { MailboxSyncPage } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import {
  getCategoryMap,
  convertMessage,
  getFolderIds,
} from "@/utils/outlook/message";
import {
  extractErrorInfo,
  withMicrosoftGraphRetry,
} from "@/utils/outlook/retry";
import {
  isNotFoundError,
  OutlookSyncFolderUnavailableError,
} from "@/utils/outlook/errors";
import { mapWithConcurrency } from "@/utils/async";

const MESSAGE_SELECT_FIELDS =
  "id,conversationId,conversationIndex,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,isDraft,isRead,flag,categories,parentFolderId,hasAttachments,webLink,inferenceClassification";

const MESSAGE_REFETCH_CONCURRENCY = 5;
const SYNC_FOLDER_NOT_FOUND = "ErrorSyncFolderNotFound";
const FOLDER_RECOVERY_TIMEOUT_MS = 5000;

type DeltaMessage = Message & {
  "@removed"?: { reason?: string };
};

type DeltaResponse = {
  value?: DeltaMessage[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
};

export async function getOutlookMailboxSyncPage({
  client,
  logger,
  cursor,
  after,
  folderId,
  limit,
  signal,
}: {
  client: OutlookClient;
  logger: Logger;
  cursor?: string;
  after?: Date;
  folderId?: string;
  limit: number;
  signal?: AbortSignal;
}): Promise<MailboxSyncPage> {
  if (!cursor) {
    if (!after) throw new Error("after is required for initial mailbox sync");
    return getInitialPage({ client, logger, after, folderId, limit });
  }

  const decoded = decodeMailboxSyncCursor(cursor, "microsoft");
  if (folderId && decoded.folderId && folderId !== decoded.folderId) {
    throw new InvalidMailboxSyncCursorError();
  }
  let deltaFetched = false;
  try {
    const deltaResponse = await withMicrosoftGraphRetry<DeltaResponse>(
      () =>
        client
          .getClient()
          .api(decoded.deltaLink)
          .header("Prefer", `IdType="ImmutableId", odata.maxpagesize=${limit}`)
          .get(),
      logger,
    );
    deltaFetched = true;
    const { response, missingMessageCount } =
      await resolveAmbiguousDeltaMessages({
        client,
        logger,
        response: deltaResponse,
      });
    const [categoryMap, folderIds] = await Promise.all([
      getCategoryMap(client, logger),
      getFolderIds(client, logger),
    ]);
    const page = buildOutlookMailboxSyncPage({
      response,
      after: decoded.after,
      folderId: decoded.folderId ?? folderId,
      wasSnapshot: decoded.snapshot,
      reset: false,
      categoryMap,
      folderIds,
    });
    if (missingMessageCount > 0) {
      mailboxSyncDiagnosticLogger(logger).info(
        "Outlook delta page handled missing messages",
        { missingMessageCount, checkpointAdvanced: page.cursor !== cursor },
      );
    }
    return page;
  } catch (error) {
    const { status, code } = extractErrorInfo(error);
    const folderNotFound =
      !deltaFetched && status === 404 && code === SYNC_FOLDER_NOT_FOUND;
    const restart =
      status === 410 ||
      code === "SyncStateNotFound" ||
      code === "resyncRequired" ||
      folderNotFound;
    if (!deltaFetched) {
      mailboxSyncDiagnosticLogger(logger).warn("Outlook delta request failed", {
        status: typeof status === "number" ? status : undefined,
        code: mailboxSyncDiagnosticCode(code),
        checkpointAdvanced: false,
        restart,
      });
    }
    if (!restart) throw error;
    let recoverySignal: AbortSignal | undefined;
    if (folderNotFound) {
      const timeout = AbortSignal.timeout(FOLDER_RECOVERY_TIMEOUT_MS);
      recoverySignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
    }
    return readInitialPage({
      client,
      logger,
      after: new Date(decoded.after),
      folderId: decoded.folderId ?? folderId,
      limit,
      signal: recoverySignal,
      recoveringMissingFolder: folderNotFound,
    });
  }
}

export function buildOutlookMailboxSyncPage({
  response,
  after,
  folderId,
  wasSnapshot,
  reset,
  categoryMap,
  folderIds = {},
}: {
  response: DeltaResponse;
  after: string;
  folderId?: string;
  wasSnapshot: boolean;
  reset: boolean;
  categoryMap: Map<string, string>;
  folderIds?: Record<string, string>;
}): MailboxSyncPage {
  const nextLink = response["@odata.nextLink"];
  const deltaLink = response["@odata.deltaLink"];
  const continuationLink = nextLink ?? deltaLink;
  if (!continuationLink) {
    throw new Error("Microsoft Graph delta response omitted its cursor");
  }

  const deletedMessageIds: string[] = [];
  const removedMessageIds: string[] = [];
  const latestMessages = new Map<string, DeltaMessage>();
  for (const message of response.value ?? []) {
    if (message.id) latestMessages.set(message.id, message);
  }

  const upsertedMessages = [...latestMessages.values()].flatMap((message) => {
    if (!message.id) return [];
    if (message["@removed"]) {
      if (message["@removed"].reason === "deleted") {
        deletedMessageIds.push(message.id);
      } else {
        removedMessageIds.push(message.id);
      }
      return [];
    }
    if (!message.conversationId) return [];

    return [
      compactMailboxSyncMessage(
        convertMessage(message, folderIds, categoryMap),
      ),
    ];
  });

  return {
    cursor: encodeMailboxSyncCursor({
      version: 1,
      provider: "microsoft",
      deltaLink: continuationLink,
      ...(folderId ? { folderId } : {}),
      after,
      snapshot: Boolean(nextLink) && wasSnapshot,
    }),
    deletedMessageIds,
    hasMore: Boolean(nextLink),
    removedMessageIds,
    reset,
    upsertedMessages,
  };
}

async function getInitialPage({
  client,
  logger,
  after,
  folderId,
  limit,
  signal,
  recoveringMissingFolder,
}: {
  client: OutlookClient;
  logger: Logger;
  after: Date;
  folderId?: string;
  limit: number;
  signal?: AbortSignal;
  recoveringMissingFolder?: boolean;
}) {
  const resolvedFolderId = folderId ?? "inbox";
  const snapshotResponse = await readSyncRequest<DeltaResponse>(
    () =>
      client
        .getClient()
        .api(
          `/me/mailFolders/${encodeURIComponent(resolvedFolderId)}/messages/delta`,
        )
        .select(MESSAGE_SELECT_FIELDS)
        .filter(`receivedDateTime ge ${after.toISOString()}`)
        .top(limit)
        .header("Prefer", `IdType="ImmutableId", odata.maxpagesize=${limit}`),
    logger,
    signal,
  ).catch((error: unknown) => {
    if (recoveringMissingFolder && extractErrorInfo(error).status === 404) {
      throw new OutlookSyncFolderUnavailableError();
    }
    throw error;
  });
  const { response } = await resolveAmbiguousDeltaMessages({
    client,
    logger,
    response: snapshotResponse,
    signal,
  });

  const [categoryMap, folderIds] = await Promise.all([
    getCategoryMap(client, logger, signal),
    getFolderIds(client, logger, { signal }),
  ]);
  return buildOutlookMailboxSyncPage({
    response,
    after: after.toISOString(),
    folderId: resolvedFolderId,
    wasSnapshot: true,
    reset: true,
    categoryMap,
    folderIds,
  });
}

// Graph delta can omit a conversation or report a folder move as a deletion,
// so resolve those ambiguous entries against the current message state.
async function resolveAmbiguousDeltaMessages({
  client,
  logger,
  response,
  signal,
}: {
  client: OutlookClient;
  logger: Logger;
  response: DeltaResponse;
  signal?: AbortSignal;
}) {
  const messages = response.value ?? [];
  if (!messages.some(needsMessageRefetch)) {
    return { response, missingMessageCount: 0 };
  }

  let missingMessageCount = 0;
  const refetched = await mapWithConcurrency(
    messages,
    MESSAGE_REFETCH_CONCURRENCY,
    async (message) => {
      if (!needsMessageRefetch(message)) return message;
      const currentMessage = await getSyncMessage({
        client,
        logger,
        messageId: message.id,
        signal,
      });
      if (currentMessage) return currentMessage;
      missingMessageCount++;

      // Folder deltas use `deleted` for both permanent deletion and moving a
      // message out of the folder. Keep the removal when the message is gone.
      return isDeletedRemoval(message) ? message : null;
    },
  );
  const completeMessages = refetched.filter(
    (message): message is DeltaMessage =>
      message !== null && !isPartialMessage(message),
  );
  const unresolvedCount = messages.length - completeMessages.length;

  if (unresolvedCount > 0) {
    logger.warn("Skipped delta messages without a conversation", {
      unresolvedCount,
    });
  }

  return {
    response: { ...response, value: completeMessages },
    missingMessageCount,
  };
}

function isPartialMessage(
  message: DeltaMessage,
): message is DeltaMessage & { id: string } {
  return Boolean(message.id && !message["@removed"] && !message.conversationId);
}

function isDeletedRemoval(
  message: DeltaMessage,
): message is DeltaMessage & { id: string } {
  return Boolean(message.id && message["@removed"]?.reason === "deleted");
}

function needsMessageRefetch(
  message: DeltaMessage,
): message is DeltaMessage & { id: string } {
  return isPartialMessage(message) || isDeletedRemoval(message);
}

async function getSyncMessage({
  client,
  logger,
  messageId,
  signal,
}: {
  client: OutlookClient;
  logger: Logger;
  messageId: string;
  signal?: AbortSignal;
}): Promise<DeltaMessage | null> {
  try {
    return await readSyncRequest<DeltaMessage>(
      () =>
        client
          .getClient()
          .api(`/me/messages/${encodeURIComponent(messageId)}`)
          .select(MESSAGE_SELECT_FIELDS)
          .header("Prefer", 'IdType="ImmutableId"'),
      logger,
      signal,
    );
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
}

async function readInitialPage(input: Parameters<typeof getInitialPage>[0]) {
  const { signal } = input;
  if (!signal) return getInitialPage(input);

  signal.throwIfAborted();
  // Lookup retry waits can outlive the HTTP request they were retrying.
  const { promise, reject } = Promise.withResolvers<never>();
  const onAbort = () => reject(signal.reason);
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([getInitialPage(input), promise]);
  } finally {
    signal.removeEventListener("abort", onAbort);
  }
}

async function readSyncRequest<T>(
  request: () => GraphRequest,
  logger: Logger,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return withMicrosoftGraphRetry<T>(() => request().get(), logger);

  signal.throwIfAborted();
  return request()
    .options({ signal })
    .middlewareOptions([new RetryHandlerOptions(0, 0)])
    .get();
}

function mailboxSyncDiagnosticLogger(logger: Logger) {
  // Keep the request ID for correlation without inheriting mailbox identifiers.
  return logger.with({
    email: undefined,
    emailAccountId: undefined,
    userId: undefined,
    url: undefined,
  });
}

function mailboxSyncDiagnosticCode(code: string | undefined) {
  switch (code) {
    case "ErrorItemNotFound":
    case "ErrorInvalidSyncStateData":
    case SYNC_FOLDER_NOT_FOUND:
    case "SyncStateNotFound":
    case "resyncRequired":
      return code;
    default:
      return "other";
  }
}
