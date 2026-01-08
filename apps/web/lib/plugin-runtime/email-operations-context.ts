/**
 * Email Operations Context Factory
 *
 * Creates PluginEmailOperations instances that wrap email provider operations.
 * This provides plugins with capability-gated access to email manipulation.
 *
 * Supports both Gmail and Microsoft providers with provider-specific implementations
 * for operations that differ between the two (e.g., star/flag, importance).
 *
 * Requires capability: email:modify (verified trust level)
 */

import type {
  PluginEmailOperations,
  LabelOperationResult,
  ModifyOperationResult,
} from "@/packages/plugin-sdk/src/types/email-operations";
import { PluginCapabilityError } from "./context-factory";
import { createEmailProvider } from "@/utils/email/provider";
import type { EmailProvider } from "@/utils/email/types";
import { getOutlookClientForEmail } from "@/utils/account";
import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { escapeODataString } from "@/utils/outlook/odata-escape";
import { withOutlookRetry } from "@/utils/outlook/retry";

const logger = createScopedLogger("plugin-runtime/email-operations");

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface CreateEmailOperationsOptions {
  emailAccountId: string;
  provider: "google" | "microsoft";
  pluginId: string;
  userEmail: string;
}

interface GmailEmailOperationsConfig {
  emailProvider: EmailProvider;
  userEmail: string;
  pluginLogger: Logger;
}

interface MicrosoftEmailOperationsConfig {
  emailProvider: EmailProvider;
  outlookClient: OutlookClient;
  userEmail: string;
  pluginLogger: Logger;
}

// -----------------------------------------------------------------------------
// Microsoft-specific helpers
// -----------------------------------------------------------------------------

/**
 * Set the flag status for all messages in a Microsoft/Outlook thread.
 * Microsoft Graph uses flag.flagStatus: 'flagged' | 'notFlagged' | 'complete'
 */
async function setMicrosoftThreadFlag(
  client: OutlookClient,
  threadId: string,
  flagged: boolean,
  pluginLogger: Logger,
): Promise<void> {
  const escapedThreadId = escapeODataString(threadId);

  const messages = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api("/me/messages")
        .filter(`conversationId eq '${escapedThreadId}'`)
        .select("id")
        .get(),
    pluginLogger,
  );

  await Promise.all(
    messages.value.map((message: { id: string }) =>
      withOutlookRetry(
        () =>
          client
            .getClient()
            .api(`/me/messages/${message.id}`)
            .patch({
              flag: {
                flagStatus: flagged ? "flagged" : "notFlagged",
              },
            }),
        pluginLogger,
      ),
    ),
  );
}

/**
 * Set the importance level for all messages in a Microsoft/Outlook thread.
 * Microsoft Graph uses importance: 'low' | 'normal' | 'high'
 */
async function setMicrosoftThreadImportance(
  client: OutlookClient,
  threadId: string,
  important: boolean,
  pluginLogger: Logger,
): Promise<void> {
  const escapedThreadId = escapeODataString(threadId);

  const messages = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api("/me/messages")
        .filter(`conversationId eq '${escapedThreadId}'`)
        .select("id")
        .get(),
    pluginLogger,
  );

  await Promise.all(
    messages.value.map((message: { id: string }) =>
      withOutlookRetry(
        () =>
          client
            .getClient()
            .api(`/me/messages/${message.id}`)
            .patch({
              importance: important ? "high" : "normal",
            }),
        pluginLogger,
      ),
    ),
  );
}

// -----------------------------------------------------------------------------
// Gmail Email Operations Implementation
// -----------------------------------------------------------------------------

/**
 * Creates Gmail-specific email operations.
 * Gmail uses labels for all operations including star (STARRED) and importance (IMPORTANT).
 */
export function createGmailEmailOperations(
  config: GmailEmailOperationsConfig,
): PluginEmailOperations {
  const { emailProvider, userEmail, pluginLogger } = config;

  return {
    async applyLabel(
      threadId: string,
      labelName: string,
    ): Promise<LabelOperationResult> {
      pluginLogger.info("Plugin applying label", { threadId, labelName });

      try {
        const label = await emailProvider.getLabelByName(labelName);
        let labelId = label?.id;

        if (!labelId) {
          const newLabel = await emailProvider.createLabel(labelName);
          labelId = newLabel.id;
        }

        await emailProvider.labelMessage({
          messageId: threadId,
          labelId,
          labelName,
        });

        return { success: true, labelId };
      } catch (error) {
        pluginLogger.error("Failed to apply label", {
          threadId,
          labelName,
          error,
        });
        return { success: false };
      }
    },

    async removeLabel(
      threadId: string,
      labelName: string,
    ): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin removing label", { threadId, labelName });

      try {
        const label = await emailProvider.getLabelByName(labelName);
        if (!label?.id) {
          return { success: true };
        }

        await emailProvider.removeThreadLabel(threadId, label.id);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to remove label", {
          threadId,
          labelName,
          error,
        });
        return { success: false };
      }
    },

    async moveToFolder(
      threadId: string,
      folderName: string,
    ): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin moving to folder", { threadId, folderName });

      try {
        await emailProvider.moveThreadToFolder(threadId, userEmail, folderName);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to move to folder", {
          threadId,
          folderName,
          error,
        });
        return { success: false };
      }
    },

    async archive(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin archiving thread", { threadId });

      try {
        await emailProvider.archiveThread(threadId, userEmail);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to archive thread", { threadId, error });
        return { success: false };
      }
    },

    async unarchive(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin unarchiving thread", { threadId });

      try {
        await emailProvider.moveThreadToFolder(threadId, userEmail, "INBOX");
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to unarchive thread", { threadId, error });
        return { success: false };
      }
    },

    async markAsRead(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as read", { threadId });

      try {
        await emailProvider.markReadThread(threadId, true);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as read", { threadId, error });
        return { success: false };
      }
    },

    async markAsUnread(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as unread", { threadId });

      try {
        await emailProvider.markReadThread(threadId, false);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as unread", { threadId, error });
        return { success: false };
      }
    },

    async star(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin starring thread", { threadId });

      try {
        // Gmail uses STARRED label
        await emailProvider.labelMessage({
          messageId: threadId,
          labelId: "STARRED",
          labelName: "STARRED",
        });
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to star thread", { threadId, error });
        return { success: false };
      }
    },

    async unstar(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin unstarring thread", { threadId });

      try {
        await emailProvider.removeThreadLabel(threadId, "STARRED");
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to unstar thread", { threadId, error });
        return { success: false };
      }
    },

    async markAsImportant(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as important", { threadId });

      try {
        // Gmail uses IMPORTANT label
        await emailProvider.labelMessage({
          messageId: threadId,
          labelId: "IMPORTANT",
          labelName: "IMPORTANT",
        });
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as important", { threadId, error });
        return { success: false };
      }
    },

    async markAsNotImportant(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as not important", { threadId });

      try {
        await emailProvider.removeThreadLabel(threadId, "IMPORTANT");
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as not important", {
          threadId,
          error,
        });
        return { success: false };
      }
    },

    async trash(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin trashing thread", { threadId });

      try {
        await emailProvider.trashThread(threadId, userEmail, "automation");
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to trash thread", { threadId, error });
        return { success: false };
      }
    },

    async markAsSpam(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as spam", { threadId });

      try {
        await emailProvider.markSpam(threadId);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as spam", { threadId, error });
        return { success: false };
      }
    },

    async createLabel(
      labelName: string,
      description?: string,
    ): Promise<string> {
      pluginLogger.info("Plugin creating label", { labelName, description });

      try {
        const label = await emailProvider.createLabel(labelName, description);
        return label.id;
      } catch (error) {
        pluginLogger.error("Failed to create label", { labelName, error });
        throw new Error(`Failed to create label "${labelName}"`);
      }
    },

    async deleteLabel(labelName: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin deleting label", { labelName });

      try {
        const label = await emailProvider.getLabelByName(labelName);
        if (!label?.id) {
          return { success: true };
        }

        await emailProvider.deleteLabel(label.id);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to delete label", { labelName, error });
        return { success: false };
      }
    },

    async listLabels(): Promise<Array<{ id: string; name: string }>> {
      pluginLogger.trace("Plugin listing labels");

      try {
        const labels = await emailProvider.getLabels();
        return labels.map((label) => ({
          id: label.id,
          name: label.name,
        }));
      } catch (error) {
        pluginLogger.error("Failed to list labels", { error });
        return [];
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Microsoft Email Operations Implementation
// -----------------------------------------------------------------------------

/**
 * Creates Microsoft/Outlook-specific email operations.
 * Microsoft uses:
 * - Categories for labels
 * - Folders for organization
 * - flag.flagStatus for star/flag operations
 * - importance property for importance
 */
export function createMicrosoftEmailOperations(
  config: MicrosoftEmailOperationsConfig,
): PluginEmailOperations {
  const { emailProvider, outlookClient, userEmail, pluginLogger } = config;

  return {
    async applyLabel(
      threadId: string,
      labelName: string,
    ): Promise<LabelOperationResult> {
      pluginLogger.info("Plugin applying label (category)", {
        threadId,
        labelName,
      });

      try {
        // Microsoft uses categories instead of labels
        const label = await emailProvider.getLabelByName(labelName);
        let labelId = label?.id;

        if (!labelId) {
          const newLabel = await emailProvider.createLabel(labelName);
          labelId = newLabel.id;
        }

        await emailProvider.labelMessage({
          messageId: threadId,
          labelId,
          labelName,
        });

        return { success: true, labelId };
      } catch (error) {
        pluginLogger.error("Failed to apply label (category)", {
          threadId,
          labelName,
          error,
        });
        return { success: false };
      }
    },

    async removeLabel(
      threadId: string,
      labelName: string,
    ): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin removing label (category)", {
        threadId,
        labelName,
      });

      try {
        const label = await emailProvider.getLabelByName(labelName);
        if (!label?.id) {
          return { success: true };
        }

        await emailProvider.removeThreadLabel(threadId, label.id);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to remove label (category)", {
          threadId,
          labelName,
          error,
        });
        return { success: false };
      }
    },

    async moveToFolder(
      threadId: string,
      folderName: string,
    ): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin moving to folder", { threadId, folderName });

      try {
        // Microsoft uses folders, map common names to well-known folder IDs
        await emailProvider.moveThreadToFolder(threadId, userEmail, folderName);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to move to folder", {
          threadId,
          folderName,
          error,
        });
        return { success: false };
      }
    },

    async archive(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin archiving thread", { threadId });

      try {
        // Microsoft moves to Archive folder
        await emailProvider.archiveThread(threadId, userEmail);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to archive thread", { threadId, error });
        return { success: false };
      }
    },

    async unarchive(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin unarchiving thread", { threadId });

      try {
        // Move back to Inbox folder
        await emailProvider.moveThreadToFolder(threadId, userEmail, "inbox");
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to unarchive thread", { threadId, error });
        return { success: false };
      }
    },

    async markAsRead(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as read", { threadId });

      try {
        await emailProvider.markReadThread(threadId, true);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as read", { threadId, error });
        return { success: false };
      }
    },

    async markAsUnread(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as unread", { threadId });

      try {
        await emailProvider.markReadThread(threadId, false);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as unread", { threadId, error });
        return { success: false };
      }
    },

    async star(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin flagging thread", { threadId });

      try {
        // Microsoft uses flag.flagStatus: 'flagged'
        await setMicrosoftThreadFlag(
          outlookClient,
          threadId,
          true,
          pluginLogger,
        );
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to flag thread", { threadId, error });
        return { success: false };
      }
    },

    async unstar(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin unflagging thread", { threadId });

      try {
        // Microsoft uses flag.flagStatus: 'notFlagged'
        await setMicrosoftThreadFlag(
          outlookClient,
          threadId,
          false,
          pluginLogger,
        );
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to unflag thread", { threadId, error });
        return { success: false };
      }
    },

    async markAsImportant(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as important", { threadId });

      try {
        // Microsoft uses importance: 'high'
        await setMicrosoftThreadImportance(
          outlookClient,
          threadId,
          true,
          pluginLogger,
        );
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as important", { threadId, error });
        return { success: false };
      }
    },

    async markAsNotImportant(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as not important", { threadId });

      try {
        // Microsoft uses importance: 'normal'
        await setMicrosoftThreadImportance(
          outlookClient,
          threadId,
          false,
          pluginLogger,
        );
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as not important", {
          threadId,
          error,
        });
        return { success: false };
      }
    },

    async trash(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin trashing thread", { threadId });

      try {
        // Microsoft moves to Deleted Items folder
        await emailProvider.trashThread(threadId, userEmail, "automation");
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to trash thread", { threadId, error });
        return { success: false };
      }
    },

    async markAsSpam(threadId: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin marking as spam", { threadId });

      try {
        // Microsoft moves to Junk Email folder
        await emailProvider.markSpam(threadId);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to mark as spam", { threadId, error });
        return { success: false };
      }
    },

    async createLabel(
      labelName: string,
      description?: string,
    ): Promise<string> {
      pluginLogger.info("Plugin creating category", { labelName, description });

      try {
        // Microsoft uses categories (masterCategories)
        const label = await emailProvider.createLabel(labelName, description);
        return label.id;
      } catch (error) {
        pluginLogger.error("Failed to create category", { labelName, error });
        throw new Error(`Failed to create category "${labelName}"`);
      }
    },

    async deleteLabel(labelName: string): Promise<ModifyOperationResult> {
      pluginLogger.info("Plugin deleting category", { labelName });

      try {
        const label = await emailProvider.getLabelByName(labelName);
        if (!label?.id) {
          return { success: true };
        }

        await emailProvider.deleteLabel(label.id);
        return { success: true };
      } catch (error) {
        pluginLogger.error("Failed to delete category", { labelName, error });
        return { success: false };
      }
    },

    async listLabels(): Promise<Array<{ id: string; name: string }>> {
      pluginLogger.trace("Plugin listing categories");

      try {
        const labels = await emailProvider.getLabels();
        return labels.map((label) => ({
          id: label.id,
          name: label.name,
        }));
      } catch (error) {
        pluginLogger.error("Failed to list categories", { error });
        return [];
      }
    },
  };
}

// -----------------------------------------------------------------------------
// Factory Function
// -----------------------------------------------------------------------------

/**
 * Creates the appropriate email operations implementation based on the provider.
 * Automatically selects between Gmail and Microsoft implementations.
 */
export function createEmailOperations(
  provider: "google" | "microsoft",
  config: GmailEmailOperationsConfig | MicrosoftEmailOperationsConfig,
): PluginEmailOperations {
  if (provider === "google") {
    return createGmailEmailOperations(config as GmailEmailOperationsConfig);
  }
  return createMicrosoftEmailOperations(
    config as MicrosoftEmailOperationsConfig,
  );
}

/**
 * Creates a PluginEmailOperations instance for a plugin.
 * All operations are logged for audit purposes.
 * Automatically selects the correct implementation based on the email provider.
 */
export async function createPluginEmailOperations(
  options: CreateEmailOperationsOptions,
): Promise<PluginEmailOperations> {
  const { emailAccountId, provider, pluginId, userEmail } = options;

  const pluginLogger = logger.with({ pluginId });

  const emailProvider = await createEmailProvider({
    emailAccountId,
    provider,
    logger: pluginLogger,
  });

  if (provider === "google") {
    return createGmailEmailOperations({
      emailProvider,
      userEmail,
      pluginLogger,
    });
  }

  // Microsoft provider needs the OutlookClient for flag/importance operations
  const outlookClient = await getOutlookClientForEmail({
    emailAccountId,
    logger: pluginLogger,
  });

  return createMicrosoftEmailOperations({
    emailProvider,
    outlookClient,
    userEmail,
    pluginLogger,
  });
}

/**
 * Creates a throwing PluginEmailOperations for when the capability is not declared.
 * All operations throw PluginCapabilityError with clear guidance.
 */
export function createNoOpEmailOperations(): PluginEmailOperations {
  const throwError = (): never => {
    throw new PluginCapabilityError("email:modify", "ctx.emailOperations.*");
  };

  return {
    applyLabel: throwError,
    removeLabel: throwError,
    moveToFolder: throwError,
    archive: throwError,
    unarchive: throwError,
    markAsRead: throwError,
    markAsUnread: throwError,
    star: throwError,
    unstar: throwError,
    markAsImportant: throwError,
    markAsNotImportant: throwError,
    trash: throwError,
    markAsSpam: throwError,
    createLabel: throwError,
    deleteLabel: throwError,
    listLabels: throwError,
  };
}
