import { messageMatchesPredicate } from "@inboxzero/mail-core/query-semantics";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import type {
  MailboxSource,
  ScopeDescriptor,
} from "@inboxzero/mail-core/ports/mailbox-source";
import type { MessageKey, Provider } from "@inboxzero/mail-core/identities";
import type {
  BodyObservation,
  ProviderChange,
  SyncPosition,
} from "@inboxzero/mail-core/sync";
import {
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
  InvalidMailboxSyncCursorError,
} from "@/utils/email/mailbox-sync";
import type { EmailProvider, ProviderMailboxSearch } from "@/utils/email/types";
import {
  parsedMessageMetadata,
  parsedMessageBodyObservation,
  parsedMessagePatch,
} from "@/utils/mail-api/observations";
import { isProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { extractErrorInfo as extractGmailErrorInfo } from "@/utils/gmail/retry";
import { extractErrorInfo as extractOutlookErrorInfo } from "@/utils/outlook/retry";
import type { ParsedMessage } from "@/utils/types";
import { mapWithConcurrency } from "@/utils/async";
import { convertEmailHtmlToText } from "@/utils/mail";

// Outlook allows four concurrent Graph requests per mailbox, shared with
// webhook processing, so batched folder reads stay below that.
const CHANGES_BATCH_CONCURRENCY = 3;

const SUPPORTED_CHANGES = [
  "archive",
  "unarchive",
  "set_read",
  "set_starred",
  "trash",
  "restore_from_trash",
  "set_spam",
  "move",
  "set_membership",
  "snooze",
] as const;

type FolderScopeNode = {
  id: string;
  systemType?: string;
  childFolders?: FolderScopeNode[];
};

type BootstrapToken = {
  afterMs?: number;
  catchUpFrom?: SyncPosition | null;
  folderId?: string | null;
  pageToken?: string;
  scopeId?: string;
};

export function createEmailProviderMailboxSource(input: {
  provider: EmailProvider;
  accountId: string;
}): MailboxSource & Required<Pick<MailboxSource, "readChangesBatch">> {
  const { provider, accountId } = input;
  const maxPageSize = provider.name === "microsoft" ? 20 : 50;
  const source: MailboxSource = {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy:
            provider.localMailSyncStrategy === "folder-delta"
              ? "folder_delta"
              : "account_history",
          supportedChanges: [...SUPPORTED_CHANGES],
          maxPageSize,
          maxHydrationBatch: 20,
        },
      };
    },
    async discoverScopes() {
      if (provider.name === "microsoft") {
        const folders = await provider.getFolders();
        return {
          status: "ok",
          value: {
            scopes: flattenFolderScopes(folders),
            nextPage: null,
          },
        };
      }
      return {
        status: "ok",
        value: {
          scopes: [{ id: "primary", kind: "account", folderId: null }],
          nextPage: null,
        },
      };
    },
    async beginBootstrap({ afterMs, scope, session }) {
      try {
        const token: BootstrapToken = {
          afterMs: afterMs ?? 0,
          scopeId: scope.id,
          folderId: scopedFolderId(provider, scope),
        };
        const catchUpFrom: SyncPosition = {
          streamId: token.scopeId ?? "primary",
          generation: session.generation,
          checkpoint: await catchUpCheckpoint(
            provider,
            [],
            token.folderId ?? undefined,
            token.afterMs ?? 0,
          ),
        };
        token.catchUpFrom = catchUpFrom;
        return {
          status: "ok" as const,
          value: {
            bootstrapId: "mailbox",
            enumerationToken: JSON.stringify(token),
            catchUpFrom,
          },
        };
      } catch (error) {
        return mapProviderError(error);
      }
    },
    async enumerate({ page, session, pageSize }) {
      try {
        const token = JSON.parse(page) as BootstrapToken;
        const syncPage = await provider.getMessagesWithPagination({
          maxResults: Math.min(pageSize, maxPageSize),
          folderId: token.folderId ?? undefined,
          pageToken: token.pageToken,
          includeDrafts: true,
        });
        const { changes, requiredHydration, bodies } = enumeratedObservations(
          accountId,
          provider.name,
          syncPage.messages,
        );
        if (syncPage.nextPageToken) {
          return {
            status: "ok" as const,
            value: {
              bootstrapId: "mailbox",
              scopeId: token.scopeId ?? "primary",
              changes,
              requiredHydration,
              bodies,
              nextPage: JSON.stringify({
                afterMs: token.afterMs ?? 0,
                catchUpFrom: token.catchUpFrom ?? null,
                folderId: token.folderId ?? null,
                pageToken: syncPage.nextPageToken,
                scopeId: token.scopeId ?? "primary",
              }),
              catchUpFrom: null,
            },
          };
        }
        return {
          status: "ok" as const,
          value: {
            bootstrapId: "mailbox",
            scopeId: token.scopeId ?? "primary",
            changes,
            requiredHydration,
            bodies,
            nextPage: null,
            catchUpFrom: await finalCatchUpFrom({
              provider,
              token,
              session,
              messages: syncPage.messages,
            }),
          },
        };
      } catch (error) {
        if (error instanceof InvalidMailboxSyncCursorError) {
          return { status: "reset_required", scopeId: "primary" };
        }
        return mapProviderError(error);
      }
    },
    async readChanges({ position, session, requestId, pageSize }) {
      try {
        const page = await provider.getMailboxSyncPage({
          cursor: position.checkpoint || undefined,
          folderId:
            provider.name === "microsoft" && position.streamId !== "primary"
              ? position.streamId
              : undefined,
          limit: pageSize,
        });
        if (page.reset) {
          return { status: "reset_required", scopeId: position.streamId };
        }
        const patches = page.upsertedMessages.flatMap(
          (message) =>
            parsedMessagePatch(accountId, provider.name, message) ?? [],
        );
        return {
          status: "page" as const,
          page: {
            session,
            requestId,
            from: position,
            to: {
              streamId: position.streamId,
              generation: session.generation,
              checkpoint: page.cursor,
            },
            changes: [
              ...patches,
              ...page.deletedMessageIds.map((messageId) => ({
                kind: "message_deleted" as const,
                key: { accountId, messageId },
                // Delta cursors can outgrow the evidence limit; the page
                // already carries the cursor as its checkpoint.
                evidence: requestId,
              })),
              ...(page.removedMessageIds ?? []).map((messageId) => ({
                kind: "removed_from_scope" as const,
                key: { accountId, messageId },
                scopeId: position.streamId,
              })),
            ],
            // Delta pages carry metadata only, so a body-derived flag such as
            // a meeting invitation must not stand in for the body.
            requiredHydration: patches.map((patch) => patch.key),
            roundComplete: !page.hasMore,
          },
        };
      } catch (error) {
        if (error instanceof InvalidMailboxSyncCursorError) {
          return { status: "reset_required", scopeId: position.streamId };
        }
        return mapProviderError(error);
      }
    },
    async hydrate({ keys, purpose }) {
      try {
        const messages = [];
        const unresolved = [];
        for (const key of keys) {
          try {
            messages.push(await provider.getMessage(key.messageId));
          } catch (error) {
            if (!isMissingProviderResource(error)) throw error;
            unresolved.push({ key, reason: "not_found" as const });
          }
        }
        const changes: ProviderChange[] = [];
        const bodies: BodyObservation[] = [];
        for (const message of messages) {
          const patch = parsedMessagePatch(accountId, provider.name, message);
          if (!patch) continue;
          changes.push(patch);
          if (purpose === "body") bodies.push(hydratedBody(accountId, message));
        }
        return {
          status: "ok" as const,
          value: { changes, bodies, unresolved },
        };
      } catch (error) {
        return mapProviderError(error);
      }
    },
    async readConversationMembership({
      conversation,
      resolutionId,
      page,
      pageSize,
    }) {
      try {
        const thread = await provider.getThread(conversation.conversationId, {
          complete: true,
        });
        const messages =
          thread.messages.length > 0
            ? thread.messages
            : await provider.getThreadMessages(conversation.conversationId);
        const start = page ? Number(page) || 0 : 0;
        const changes = messages
          .slice(start, start + pageSize)
          .flatMap(
            (message) =>
              parsedMessagePatch(accountId, provider.name, message) ?? [],
          );
        return {
          status: "ok",
          value: {
            status: "page" as const,
            page: {
              conversation,
              resolutionId,
              keys: changes.map((change) => change.key),
              changes,
              nextPage:
                start + pageSize < messages.length
                  ? String(start + pageSize)
                  : null,
              evidence: thread.historyId ?? null,
            },
          },
        };
      } catch (error) {
        if (!isMissingProviderResource(error)) return mapProviderError(error);
        return { status: "ok", value: { status: "not_found" } };
      }
    },
    async search({ predicate, page, pageSize }) {
      const compiled = compileMailboxSearch(predicate);
      if (!compiled) return { status: "unsupported" };
      let result: Awaited<ReturnType<EmailProvider["searchMessages"]>>;
      try {
        result = await provider.searchMessages({
          query: "",
          mailboxSearch: compiled.search,
          maxResults: Math.min(pageSize, maxPageSize),
          pageToken: page ?? undefined,
        });
      } catch (error) {
        // A rejected query fails the same way every time, so the client
        // must drop it rather than retry it.
        if (isRejectedProviderRequest(error)) return { status: "unsupported" };
        return mapProviderError(error);
      }
      const candidates = await mapWithConcurrency(
        result.messages,
        5,
        async (message) => {
          const fields = searchMessageFields(accountId, message);
          if (!messageMatchesPredicate(fields, compiled.filter)) return null;
          const text = compiled.search.text;
          if (!text || messageMatchesPredicate(fields, text)) return message;
          if (
            text.field !== "any" ||
            message.textPlain != null ||
            message.textHtml != null
          )
            return null;
          // List projections can omit the body that made the provider return this candidate.
          const fullMessage = await provider.getMessage(message.id);
          const fullFields = searchMessageFields(accountId, fullMessage);
          return messageMatchesPredicate(fullFields, compiled.filter) &&
            messageMatchesPredicate(fullFields, text)
            ? fullMessage
            : null;
        },
      );
      const matches = candidates.filter((message) => message !== null);
      return {
        status: "ok",
        value: {
          matches: matches.map((message) => ({
            accountId,
            messageId: message.id,
          })),
          nextPage: result.nextPageToken ?? null,
          semantics: "candidates_require_local_filter" as const,
        },
      };
    },
    async readAttachment({ key, attachmentId, signal }) {
      try {
        const stream = await provider.getAttachmentStream(
          key.messageId,
          attachmentId,
          signal,
        );
        return {
          status: "ok" as const,
          value: {
            bytes: streamToIterable(stream),
            sizeBytes: null,
          },
        };
      } catch (error) {
        if (isMissingProviderResource(error)) {
          return { status: "not_found" as const };
        }
        return mapProviderError(error);
      }
    },
  };
  return {
    ...source,
    async readChangesBatch({ session, reads, pageSize, signal }) {
      const read = (item: (typeof reads)[number]) =>
        source.readChanges({
          session,
          requestId: item.requestId,
          position: item.position,
          pageSize,
          signal,
        });
      // The first read fills the provider's folder and category lookups so the
      // rest reuse them instead of each fetching their own.
      const [first, ...rest] = reads;
      if (!first) return [];
      const firstResult = await read(first);
      return [
        firstResult,
        ...(await mapWithConcurrency(rest, CHANGES_BATCH_CONCURRENCY, read)),
      ];
    },
  };
}

function enumeratedObservations(
  accountId: string,
  provider: Provider,
  messages: ParsedMessage[],
) {
  const changes: ProviderChange[] = [];
  const requiredHydration: MessageKey[] = [];
  const bodies: BodyObservation[] = [];
  for (const message of messages) {
    const patch = parsedMessagePatch(accountId, provider, message);
    if (!patch) continue;
    changes.push(patch);
    const body = parsedMessageBodyObservation(accountId, message);
    if (body) bodies.push(body);
    else requiredHydration.push(patch.key);
  }
  return { changes, requiredHydration, bodies };
}

function hydratedBody(
  accountId: string,
  message: ParsedMessage,
): BodyObservation {
  return (
    parsedMessageBodyObservation(accountId, message) ?? {
      key: { accountId, messageId: message.id },
      version: message.historyId || null,
      html: null,
      text: null,
      attachments: [],
      isMeetingInvitation: false,
    }
  );
}

async function catchUpCheckpoint(
  provider: EmailProvider,
  messages: ParsedMessage[],
  folderId?: string,
  afterMs = 0,
): Promise<string | null> {
  try {
    const page = await provider.getMailboxSyncPage({
      after: new Date(afterMs),
      folderId,
      limit: 1,
    });
    if (page.cursor) {
      return provider.name === "google"
        ? toGmailDeltaCursor(page.cursor)
        : page.cursor;
    }
  } catch (error) {
    if (provider.name === "microsoft") throw error;
    // Fall back to the newest numeric Gmail history id we already fetched.
  }
  return encodedGmailCursorFromMessages(messages);
}

async function finalCatchUpFrom({
  provider,
  token,
  session,
  messages,
}: {
  provider: EmailProvider;
  token: BootstrapToken;
  session: { generation: string };
  messages: ParsedMessage[];
}): Promise<SyncPosition> {
  if (token.catchUpFrom) {
    const checkpoint =
      token.catchUpFrom.checkpoint ??
      (provider.name === "google"
        ? encodedGmailCursorFromMessages(messages)
        : null);
    return { ...token.catchUpFrom, checkpoint };
  }
  return {
    streamId: token.scopeId ?? "primary",
    generation: session.generation,
    checkpoint: await catchUpCheckpoint(
      provider,
      messages,
      token.folderId ?? undefined,
      token.afterMs ?? 0,
    ),
  };
}

function scopedFolderId(provider: EmailProvider, scope: ScopeDescriptor) {
  if (provider.name === "microsoft") return scope.folderId ?? scope.id;
  return scope.folderId ?? undefined;
}

function flattenFolderScopes(folders: FolderScopeNode[]) {
  const scopes: ScopeDescriptor[] = [];
  for (const folder of folders) {
    // New mail the user is waiting on lands in system folders; custom folders
    // can catch up on a slower clock.
    scopes.push({
      id: folder.id,
      kind: "folder",
      folderId: folder.id,
      priority: folder.systemType ? "high" : "low",
    });
    scopes.push(...flattenFolderScopes(folder.childFolders ?? []));
  }
  return scopes;
}

function encodedGmailCursorFromMessages(
  messages: ParsedMessage[],
): string | null {
  const historyId = messages
    .map((message) => message.historyId)
    .filter((id): id is string => Boolean(id && /^\d+$/.test(id)))
    .reduce((latest, id) => (BigInt(id) > BigInt(latest) ? id : latest), "0");
  if (historyId === "0") return null;
  return encodeMailboxSyncCursor({
    version: 1,
    provider: "google",
    phase: "delta",
    historyId,
    after: "1970-01-01T00:00:00.000Z",
  });
}

function isMissingProviderResource(error: unknown) {
  return (
    extractGmailErrorInfo(error).status === 404 ||
    extractOutlookErrorInfo(error).status === 404
  );
}

function isRejectedProviderRequest(error: unknown) {
  return (
    extractGmailErrorInfo(error).status === 400 ||
    extractOutlookErrorInfo(error).status === 400
  );
}

function mapProviderError(error: unknown) {
  if (isProviderRateLimitModeError(error)) {
    return {
      status: "paused" as const,
      retryAfterMs: 15_000,
      reason: "throttled" as const,
    };
  }
  const message = error instanceof Error ? error.message : "";
  const lowered = message.toLowerCase();
  if (
    message.includes("401") ||
    lowered.includes("unauthorized") ||
    lowered.includes("invalid_grant")
  ) {
    return { status: "blocked_auth" as const };
  }
  return {
    status: "paused" as const,
    retryAfterMs: 1000,
    reason: "unavailable" as const,
  };
}

function compileMailboxSearch(
  predicate: MailPredicate,
): { search: ProviderMailboxSearch; filter: MailPredicate } | null {
  const compiled: ProviderMailboxSearch = { mailbox: "all" };
  const children: MailPredicate[] = [];
  function flatten(part: MailPredicate) {
    if (part.kind === "all") part.predicates.forEach(flatten);
    else children.push(part);
  }
  flatten(predicate);
  let scoped = false;
  for (const child of children) {
    switch (child.kind) {
      case "text":
        if (compiled.text || child.field === "body") return null;
        compiled.text = child;
        break;
      case "mailbox":
      case "role": {
        const mailbox =
          child.kind === "mailbox"
            ? child.mailbox
            : child.role === "draft"
              ? "drafts"
              : child.role;
        if (mailbox === "snoozed" || scoped) return null;
        compiled.mailbox = mailbox;
        scoped = true;
        break;
      }
      case "read":
        if (compiled.read !== undefined && compiled.read !== child.value)
          return null;
        compiled.read = child.value;
        break;
      case "starred":
        if (compiled.starred !== undefined && compiled.starred !== child.value)
          return null;
        compiled.starred = child.value;
        break;
      case "has_attachment":
        if (
          compiled.hasAttachment !== undefined &&
          compiled.hasAttachment !== child.value
        )
          return null;
        compiled.hasAttachment = child.value;
        break;
      case "not":
        // Providers can't search by message id, so it only filters results.
        if (child.predicate.kind === "message") break;
        if (child.predicate.kind !== "role") return null;
        compiled.excludedRoles ??= [];
        compiled.excludedRoles.push(child.predicate.role);
        break;
      default:
        return null;
    }
  }
  const filters = children.filter((child) => child.kind !== "text");
  if (compiled.mailbox !== "spam" && compiled.mailbox !== "trash")
    filters.push({ kind: "mailbox", mailbox: "all" });
  return { search: compiled, filter: { kind: "all", predicates: filters } };
}

async function* streamToIterable(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function searchMessageFields(accountId: string, message: ParsedMessage) {
  return {
    ...parsedMessageMetadata(message),
    accountId,
    messageId: message.id,
    conversationId: message.threadId,
    pendingOperationIds: [],
    bodyText:
      message.textPlain ||
      (message.textHtml
        ? convertEmailHtmlToText({ htmlText: message.textHtml })
        : message.textPlain),
  };
}

// A one-message Gmail sync page on a mailbox with more mail comes back as a
// snapshot cursor mid-listing. Catching up from it would re-list the whole
// mailbox before any new mail shows. Its historyId was captured before the
// listing began, so continuing from history there misses nothing.
function toGmailDeltaCursor(cursor: string): string {
  const decoded = decodeMailboxSyncCursor(cursor, "google");
  if (decoded.phase !== "snapshot") return cursor;
  return encodeMailboxSyncCursor({
    version: 1,
    provider: "google",
    phase: "delta",
    historyId: decoded.historyId,
    after: decoded.after,
  });
}
