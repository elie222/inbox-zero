import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import type { EmailProvider } from "@/utils/email/types";
import { parsedMessagePatch } from "@/utils/mail-api/observations";

export function createEmailProviderOperationExecutor(input: {
  provider: EmailProvider;
  accountId: string;
}): OperationExecutor {
  const { provider, accountId } = input;
  const providerName = provider.name === "microsoft" ? "microsoft" : "google";
  return {
    async execute({ operation }) {
      if (operation.intent.kind !== "metadata") {
        return { status: "rejected", code: "unsupported", targets: [] };
      }
      const messageIds = operation.intent.targets.map(
        (target) => target.messageId,
      );
      try {
        await applyChange(provider, operation.intent.change, messageIds);
        const observations = [];
        try {
          for (const messageId of messageIds) {
            const message = await provider.getMessage(messageId);
            observations.push(
              parsedMessagePatch(accountId, providerName, message),
            );
          }
        } catch {
          // Provider applied the mutation; observations can arrive via catch-up.
        }
        return {
          status: "confirmed",
          receiptId: operation.key.operationId,
          observations,
          targets: operation.intent.targets.map((key) => ({
            key,
            outcome: "applied" as const,
            code: null,
          })),
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "provider_error";
        if (/auth|unauthorized|401/i.test(message)) {
          return {
            status: "not_dispatched",
            reason: "blocked_auth",
            retryAfterMs: null,
          };
        }
        return { status: "uncertain", receiptId: operation.key.operationId };
      }
    },
    async inspect({ operation }) {
      if (operation.intent.kind !== "metadata") {
        return { status: "uncertain", receiptId: operation.key.operationId };
      }
      try {
        const observations = [];
        for (const target of operation.intent.targets) {
          const message = await provider.getMessage(target.messageId);
          observations.push(
            parsedMessagePatch(accountId, providerName, message),
          );
        }
        return {
          status: "confirmed",
          receiptId: operation.key.operationId,
          observations,
          targets: operation.intent.targets.map((key) => ({
            key,
            outcome: "applied" as const,
            code: null,
          })),
        };
      } catch {
        return { status: "uncertain", receiptId: operation.key.operationId };
      }
    },
  };
}

async function applyChange(
  provider: EmailProvider,
  change: {
    kind: string;
    read?: boolean;
    starred?: boolean;
    spam?: boolean;
    folderId?: string;
    membership?: "label" | "category";
    id?: string;
    present?: boolean;
  },
  messageIds: string[],
) {
  switch (change.kind) {
    case "archive":
      await provider.archiveMessages(messageIds);
      return;
    case "unarchive":
      await provider.unarchiveMessages(messageIds);
      return;
    case "set_read":
      await provider.markMessagesReadState(messageIds, Boolean(change.read));
      return;
    case "set_starred":
      await provider.markMessagesStarredState(
        messageIds,
        Boolean(change.starred),
      );
      return;
    case "trash":
      await provider.trashMessages(messageIds);
      return;
    case "restore_from_trash":
      await provider.untrashMessages(messageIds);
      return;
    case "set_spam": {
      for (const messageId of messageIds) {
        const message = await provider.getMessage(messageId);
        if (change.spam) {
          await provider.markSpam(message.threadId);
        } else {
          await provider.unarchiveThread(message.threadId);
        }
      }
      return;
    }
    case "move": {
      if (!change.folderId) return;
      for (const messageId of messageIds) {
        const message = await provider.getMessage(messageId);
        await provider.moveThreadToFolder(
          message.threadId,
          message.headers.to || "",
          change.folderId,
        );
      }
      return;
    }
    case "set_membership": {
      if (!change.id) return;
      for (const messageId of messageIds) {
        const message = await provider.getMessage(messageId);
        if (change.present) {
          await provider.labelMessage({
            messageId,
            labelId: change.id,
            labelName: null,
          });
        } else {
          await provider.removeThreadLabel(message.threadId, change.id);
        }
      }
      return;
    }
    default:
      throw new Error(`unsupported:${change.kind}`);
  }
}
