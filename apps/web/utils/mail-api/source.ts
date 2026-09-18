import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { Provider } from "@inboxzero/mail-core/identities";
import { InvalidMailboxSyncCursorError } from "@/utils/email/mailbox-sync";
import type { EmailProvider } from "@/utils/email/types";
import { parsedMessagePatch } from "@/utils/mail-api/observations";
import { isProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";

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

export function createEmailProviderMailboxSource(input: {
  provider: EmailProvider;
  accountId: string;
}): MailboxSource {
  const { provider, accountId } = input;
  const providerName: Provider =
    provider.name === "microsoft" ? "microsoft" : "google";
  return {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy:
            provider.localMailSyncStrategy === "folder-delta"
              ? "folder_delta"
              : "account_history",
          supportedChanges: [...SUPPORTED_CHANGES],
          maxPageSize: 50,
          maxHydrationBatch: 20,
        },
      };
    },
    async discoverScopes() {
      if (provider.name !== "microsoft") {
        return {
          status: "ok",
          value: {
            scopes: [{ id: "primary", kind: "account", folderId: null }],
            nextPage: null,
          },
        };
      }
      const folders = await provider.getFolders();
      return {
        status: "ok",
        value: {
          scopes: folders.map((folder) => ({
            id: folder.id,
            kind: "folder" as const,
            folderId: folder.id,
          })),
          nextPage: null,
        },
      };
    },
    async beginBootstrap({ afterMs }) {
      return {
        status: "ok",
        value: {
          bootstrapId: "mailbox",
          enumerationToken: JSON.stringify({
            afterMs: afterMs ?? 0,
          }),
          catchUpFrom: null,
        },
      };
    },
    async enumerate({ page, session }) {
      try {
        const token = JSON.parse(page) as { pageToken?: string };
        const syncPage = await provider.getMessagesWithPagination({
          maxResults: 50,
          pageToken: token.pageToken,
          includeDrafts: true,
        });
        const changes = syncPage.messages.map((message) =>
          parsedMessagePatch(accountId, providerName, message),
        );
        return {
          status: "ok" as const,
          value: syncPage.nextPageToken
            ? {
                bootstrapId: "mailbox",
                scopeId: "primary",
                changes,
                requiredHydration: syncPage.messages
                  .filter((message) => !message.textPlain && !message.textHtml)
                  .map((message) => ({
                    accountId,
                    messageId: message.id,
                  })),
                nextPage: JSON.stringify({ pageToken: syncPage.nextPageToken }),
                catchUpFrom: null,
              }
            : {
                bootstrapId: "mailbox",
                scopeId: "primary",
                changes,
                requiredHydration: [],
                nextPage: null,
                catchUpFrom: {
                  streamId: "primary",
                  generation: session.generation,
                  checkpoint: token.pageToken ?? "enumerated",
                },
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
          limit: pageSize,
        });
        if (page.reset) {
          return { status: "reset_required", scopeId: position.streamId };
        }
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
              ...page.upsertedMessages.map((message) =>
                parsedMessagePatch(accountId, providerName, message),
              ),
              ...page.deletedMessageIds.map((messageId) => ({
                kind: "message_deleted" as const,
                key: { accountId, messageId },
                evidence: page.cursor,
              })),
            ],
            requiredHydration: page.upsertedMessages
              .filter((message) => !message.textPlain && !message.textHtml)
              .map((message) => ({ accountId, messageId: message.id })),
            roundComplete: !page.hasMore,
          },
        };
      } catch (error) {
        if (error instanceof InvalidMailboxSyncCursorError) {
          return { status: "reset_required", scopeId: position.streamId };
        }
        try {
          const result = await provider.getMessagesWithPagination({
            maxResults: pageSize,
            includeDrafts: true,
          });
          return {
            status: "page" as const,
            page: {
              session,
              requestId,
              from: position,
              to: {
                streamId: position.streamId,
                generation: session.generation,
                checkpoint: result.nextPageToken ?? position.checkpoint,
              },
              changes: result.messages.map((message) =>
                parsedMessagePatch(accountId, providerName, message),
              ),
              requiredHydration: result.messages
                .filter((message) => !message.textPlain && !message.textHtml)
                .map((message) => ({ accountId, messageId: message.id })),
              roundComplete: !result.nextPageToken,
            },
          };
        } catch (fallbackError) {
          if (fallbackError instanceof InvalidMailboxSyncCursorError) {
            return { status: "reset_required", scopeId: "primary" };
          }
          return mapProviderError(fallbackError);
        }
      }
    },
    async hydrate({ keys, purpose }) {
      try {
        const messages = [];
        const unresolved = [];
        for (const key of keys) {
          try {
            messages.push(await provider.getMessage(key.messageId));
          } catch {
            unresolved.push({ key, reason: "not_found" as const });
          }
        }
        return {
          status: "ok" as const,
          value: {
            changes: messages.map((message) =>
              parsedMessagePatch(accountId, providerName, message),
            ),
            bodies:
              purpose === "body"
                ? messages.map((message) => ({
                    key: { accountId, messageId: message.id },
                    version: message.historyId || null,
                    html: message.textHtml ?? null,
                    text: message.textPlain ?? null,
                  }))
                : [],
            unresolved,
          },
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
        const slice = messages.slice(start, start + pageSize);
        return {
          status: "ok",
          value: {
            status: "page" as const,
            page: {
              conversation,
              resolutionId,
              keys: slice.map((message) => ({
                accountId,
                messageId: message.id,
              })),
              changes: slice.map((message) =>
                parsedMessagePatch(accountId, providerName, message),
              ),
              nextPage:
                start + pageSize < messages.length
                  ? String(start + pageSize)
                  : null,
              evidence: thread.historyId ?? null,
            },
          },
        };
      } catch {
        return { status: "ok", value: { status: "not_found" } };
      }
    },
    async search({ predicate, pageSize }) {
      if (predicate.kind !== "text") return { status: "unsupported" };
      const result = await provider.searchMessages({
        query: predicate.value,
        maxResults: pageSize,
      });
      return {
        status: "ok",
        value: {
          matches: result.messages.map((message) => ({
            accountId,
            messageId: message.id,
          })),
          nextPage: result.nextPageToken ?? null,
          semantics: "candidates_require_local_filter" as const,
        },
      };
    },
    async readAttachment({ key, attachmentId, signal }) {
      const stream = await provider.getAttachmentStream(
        key.messageId,
        attachmentId,
        signal,
      );
      return {
        status: "ok",
        value: {
          bytes: streamToIterable(stream),
          sizeBytes: null,
        },
      };
    },
  };
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

async function* streamToIterable(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return;
      if (value) yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
