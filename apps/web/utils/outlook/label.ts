import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";
import { publishArchive, type TinybirdEmailAction } from "@inboxzero/tinybird";
import { OutlookLabel, WELL_KNOWN_FOLDERS } from "./constants";
import { extractErrorInfo, withOutlookRetry } from "@/utils/outlook/retry";
import {
  processThreadMessagesFallback,
  runThreadMessageMutation,
} from "@/utils/outlook/thread-helpers";
import { inboxZeroLabels, type InboxZeroLabel } from "@/utils/label";
import {
  normalizeOutlookCategoryName,
  sanitizeOutlookCategoryName,
} from "@/utils/outlook/label-validation";
import { findLabelByName } from "@/utils/label/find-label-by-name";
import type {
  OutlookCategory,
  Message,
} from "@microsoft/microsoft-graph-types";

// Outlook supported colors
export const OUTLOOK_COLORS: Array<string> = [
  "preset0", // Red
  "preset1", // Orange
  "preset2", // Yellow
  "preset3", // Green
  "preset4", // Teal
  "preset5", // Blue
  "preset6", // Purple
  "preset7", // Pink
  "preset8", // Brown
  "preset9", // Gray
] as const;

// Map Outlook preset colors to single color values
export const OUTLOOK_COLOR_MAP = {
  preset0: "#E74C3C", // Red
  preset1: "#E67E22", // Orange
  preset2: "#F1C40F", // Yellow
  preset3: "#2ECC71", // Green
  preset4: "#1ABC9C", // Teal
  preset5: "#3498DB", // Blue
  preset6: "#9B59B6", // Purple
  preset7: "#E84393", // Pink
  preset8: "#795548", // Brown
  preset9: "#95A5A6", // Gray
} as const;

export async function getLabels(client: OutlookClient) {
  const response: { value: OutlookCategory[] } = await client
    .getClient()
    .api("/me/outlook/masterCategories")
    .get();
  return response.value.map((label) => ({
    ...label,
    name: label.displayName || label.id,
  }));
}

export async function getLabelById(options: {
  client: OutlookClient;
  id: string;
}) {
  const { client, id } = options;
  const response: OutlookCategory = await client
    .getClient()
    .api(`/me/outlook/masterCategories/${id}`)
    .get();
  return response;
}

export async function createLabel({
  client,
  name,
  color,
  logger,
}: {
  client: OutlookClient;
  name: string;
  color?: string;
  logger: Logger;
}) {
  const sanitizedName = sanitizeOutlookCategoryName(name);
  if (!sanitizedName) throw new Error("Label name cannot be empty");

  try {
    // Use a random preset color if none provided or if the provided color is not supported
    const outlookColor =
      color && OUTLOOK_COLORS.includes(color)
        ? color
        : OUTLOOK_COLORS[Math.floor(Math.random() * OUTLOOK_COLORS.length)];

    const response: OutlookCategory = await withOutlookRetry(
      () =>
        client.getClient().api("/me/outlook/masterCategories").post({
          displayName: sanitizedName,
          color: outlookColor,
        }),
      logger,
    );

    client.invalidateCategoryMapCache();

    return response;
  } catch (error) {
    let { errorMessage } = extractErrorInfo(error);
    if (!errorMessage) {
      errorMessage = error instanceof Error ? error.message : "Unknown error";
    }
    if (
      errorMessage.includes("already exists") ||
      errorMessage.includes("conflict with the current state")
    ) {
      logger.warn("Label already exists", { name: sanitizedName });
      const label = await getLabel({ client, name: sanitizedName });
      if (label) return label;
      throw new Error(`Label conflict but not found: ${sanitizedName}`);
    }
    throw new Error(
      `Failed to create Outlook category "${sanitizedName}": ${errorMessage}`,
    );
  }
}

export async function getLabel(options: {
  client: OutlookClient;
  name: string;
}) {
  const { client, name } = options;
  const labels = await getLabels(client);
  const normalizedSearch = normalizeOutlookCategoryName(name);
  if (!normalizedSearch) return null;

  return findLabelByName({
    labels,
    name,
    getLabelName: (label) => label.displayName,
    normalize: normalizeOutlookCategoryName,
  });
}

export async function getOrCreateLabel({
  client,
  name,
  logger,
}: {
  client: OutlookClient;
  name: string;
  logger: Logger;
}) {
  const sanitizedName = sanitizeOutlookCategoryName(name);
  if (!sanitizedName) throw new Error("Label name cannot be empty");

  const label = await getLabel({ client, name: sanitizedName });
  if (label) return label;
  const createdLabel = await createLabel({
    client,
    name: sanitizedName,
    logger,
  });
  return createdLabel;
}

export async function getOrCreateLabels({
  client,
  names,
  logger,
}: {
  client: OutlookClient;
  names: string[];
  logger: Logger;
}): Promise<OutlookCategory[]> {
  if (!names.length) return [];

  const entries = names.map((name) => ({
    rawName: name,
    sanitizedName: sanitizeOutlookCategoryName(name),
    normalizedName: normalizeOutlookCategoryName(name),
  }));

  const emptyNames = entries.filter((entry) => !entry.sanitizedName);
  if (emptyNames.length) throw new Error("Label names cannot be empty");

  assertNoNormalizedInputCollisions(entries);

  const existingLabels = await getLabels(client);
  const labelMap = new Map<string, OutlookCategory[]>();
  existingLabels.forEach((label) => {
    if (label.displayName) {
      const normalizedLabelName = normalizeOutlookCategoryName(
        label.displayName,
      );
      const labelsForName = labelMap.get(normalizedLabelName) ?? [];
      labelsForName.push(label);
      labelMap.set(normalizedLabelName, labelsForName);
    }
  });

  const createLabelMap = new Map<string, Promise<OutlookCategory>>();

  const results = await Promise.all(
    entries.map(async ({ rawName, sanitizedName, normalizedName }) => {
      const existingLabelsForName = labelMap.get(normalizedName);
      if (existingLabelsForName?.length === 1) return existingLabelsForName[0];
      if (existingLabelsForName?.length)
        throw new Error(
          `Ambiguous Outlook category match for "${rawName}". Please use a unique category name.`,
        );

      const pendingCreate = createLabelMap.get(normalizedName);
      if (pendingCreate) return pendingCreate;

      const createPromise = createLabel({
        client,
        name: sanitizedName,
        logger,
      });
      createLabelMap.set(normalizedName, createPromise);
      return createPromise;
    }),
  );

  return results;
}

// Label message/thread functions
export async function labelMessage({
  client,
  messageId,
  categories,
  logger,
}: {
  client: OutlookClient;
  messageId: string;
  categories: string[];
  logger: Logger;
}) {
  return withOutlookRetry(
    () =>
      client.getClient().api(`/me/messages/${messageId}`).patch({
        categories,
      }),
    logger,
  );
}

export async function labelThread({
  client,
  threadId,
  categories,
  logger,
}: {
  client: OutlookClient;
  threadId: string;
  categories: string[];
  logger: Logger;
}) {
  // In Outlook, we need to update each message in the thread
  // Escape single quotes in threadId for the filter
  const escapedThreadId = threadId.replace(/'/g, "''");
  const messages: { value: Message[] } = await client
    .getClient()
    .api("/me/messages")
    .filter(`conversationId eq '${escapedThreadId}'`)
    .get();

  await runThreadMessageMutation({
    messageIds: messages.value
      .map((message) => message.id)
      .filter((messageId): messageId is string => Boolean(messageId)),
    threadId,
    logger,
    messageHandler: (messageId) =>
      labelMessage({ client, messageId, categories, logger }),
    failureMessage: "Failed to label message in thread",
  });
}

// Doesn't use pagination. But this function not really used anyway. Can add in the future of needed.
export async function removeThreadLabel({
  client,
  threadId,
  categoryName,
  logger,
}: {
  client: OutlookClient;
  threadId: string;
  categoryName: string;
  logger: Logger;
}) {
  if (!categoryName) {
    logger.warn("Category name is empty, skipping removal", { threadId });
    return;
  }

  // Get all messages in the thread
  const escapedThreadId = threadId.replace(/'/g, "''");
  const messages = await client
    .getClient()
    .api("/me/messages")
    .filter(`conversationId eq '${escapedThreadId}'`)
    .select("id,categories")
    .get();

  // Remove the category from each message
  const messagesWithCategory: Array<{ id: string; categories?: string[] }> =
    messages.value.filter((message: { id: string; categories?: string[] }) =>
      message.categories?.includes(categoryName),
    );

  await runThreadMessageMutation({
    messageIds: messagesWithCategory.map(
      (message: { id: string }) => message.id,
    ),
    threadId,
    logger,
    messageHandler: async (messageId) => {
      const message = messagesWithCategory.find(
        (item) => item.id === messageId,
      );
      if (!message?.categories) return;

      const updatedCategories = message.categories.filter(
        (cat) => cat !== categoryName,
      );

      await withOutlookRetry(
        () =>
          client.getClient().api(`/me/messages/${messageId}`).patch({
            categories: updatedCategories,
          }),
        logger,
      );
    },
    failureMessage: "Failed to remove category from message",
    continueOnError: true,
  });
}

export async function archiveThread({
  client,
  threadId,
  ownerEmail,
  actionSource,
  folderId = "archive",
  logger,
}: {
  client: OutlookClient;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  folderId?: string;
  logger: Logger;
}) {
  if (!folderId) {
    logger.warn("No folderId provided, skipping archive operation", {
      threadId,
      ownerEmail,
      actionSource,
    });
    return;
  }

  // Check if the destination folder exists (only for custom folders, well-known names can be trusted and used directly)
  const wellKnownFolders = Object.keys(WELL_KNOWN_FOLDERS);
  if (!wellKnownFolders.includes(folderId.toLowerCase())) {
    try {
      await client.getClient().api(`/me/mailFolders/${folderId}`).get();
    } catch (error) {
      logger.warn(
        "Custom destination folder not found, skipping archive operation",
        {
          folderId,
          threadId,
          error,
        },
      );
      return;
    }
  }

  try {
    // In Outlook, archiving is moving to a folder
    // We need to move each message in the thread individually
    const escapedThreadId = threadId.replace(/'/g, "''");
    const messages = await client
      .getClient()
      .api("/me/messages")
      .filter(`conversationId eq '${escapedThreadId}'`) // Escape single quotes in threadId for the filter
      .get();

    const archivePromise = runThreadMessageMutation({
      messageIds: messages.value.map((message: { id: string }) => message.id),
      threadId,
      logger,
      messageHandler: (messageId) =>
        withOutlookRetry(
          () =>
            client.getClient().api(`/me/messages/${messageId}/move`).post({
              destinationId: folderId,
            }),
          logger,
        ),
      failureMessage: "Failed to move message to folder",
      continueOnError: true,
    });

    const publishPromise = publishArchive({
      ownerEmail,
      threadId,
      actionSource,
      timestamp: Date.now(),
    });

    const [archiveResult, publishResult] = await Promise.allSettled([
      archivePromise,
      publishPromise,
    ]);

    // Handle publish errors as non-fatal (just log)
    if (publishResult.status === "rejected") {
      logger.error("Failed to publish action to move thread to folder", {
        folderId,
        threadId,
        error: publishResult.reason,
      });
    }

    // Handle archive errors
    if (archiveResult.status === "rejected") {
      const error = archiveResult.reason;
      if (error.message?.includes("Requested entity was not found")) {
        logger.warn("Thread not found", { threadId, userEmail: ownerEmail });
        return { status: 404, message: "Thread not found" };
      }
      logger.error("Failed to move thread to folder", {
        folderId,
        threadId,
        error,
      });
      throw error;
    }

    return { status: 200 };
  } catch (error) {
    // If the filter fails, try a different approach
    logger.warn("Filter failed, trying alternative approach", {
      threadId,
      error,
    });

    try {
      await processThreadMessagesFallback({
        client,
        threadId,
        logger,
        messageHandler: (messageId) =>
          withOutlookRetry(
            () =>
              client
                .getClient()
                .api(`/me/messages/${messageId}/move`)
                .post({ destinationId: folderId }),
            logger,
          ),
        noMessagesMessage:
          "No messages found for conversationId, skipping folder move",
      });

      // Publish the archive action
      try {
        await publishArchive({
          ownerEmail,
          threadId,
          actionSource,
          timestamp: Date.now(),
        });
      } catch (publishError) {
        logger.error("Failed to publish action to move thread to folder", {
          folderId,
          email: ownerEmail,
          threadId,
          error: publishError,
        });
      }

      return { status: 200 };
    } catch (directError) {
      logger.error("Failed to move thread to folder", {
        folderId,
        threadId,
        error: directError,
      });
      throw directError;
    }
  }
}

export async function markReadThread({
  client,
  threadId,
  read,
  logger,
}: {
  client: OutlookClient;
  threadId: string;
  read: boolean;
  logger: Logger;
}) {
  try {
    // In Outlook, we need to mark each message in the thread as read
    // Escape single quotes in threadId for the filter
    const escapedThreadId = threadId.replace(/'/g, "''");
    const messages = await client
      .getClient()
      .api("/me/messages")
      .filter(`conversationId eq '${escapedThreadId}'`)
      .get();

    // Update each message in the thread
    await runThreadMessageMutation({
      messageIds: messages.value.map((message: { id: string }) => message.id),
      threadId,
      logger,
      messageHandler: (messageId) =>
        withOutlookRetry(
          () =>
            client.getClient().api(`/me/messages/${messageId}`).patch({
              isRead: read,
            }),
          logger,
        ),
      failureMessage: "Failed to mark message as read",
    });
  } catch (error) {
    // If the filter fails, try a different approach
    logger.warn("Filter failed, trying alternative approach", {
      threadId,
      error,
    });

    try {
      await processThreadMessagesFallback({
        client,
        threadId,
        logger,
        messageHandler: (messageId) =>
          withOutlookRetry(
            () =>
              client
                .getClient()
                .api(`/me/messages/${messageId}`)
                .patch({ isRead: read }),
            logger,
          ),
        noMessagesMessage:
          "No messages found for conversationId, skipping mark read",
      });
    } catch (directError) {
      logger.error("Failed to mark message as read", {
        threadId,
        error: directError,
      });
      throw directError;
    }
  }
}

export async function markImportantMessage({
  client,
  messageId,
  important,
  logger,
}: {
  client: OutlookClient;
  messageId: string;
  important: boolean;
  logger: Logger;
}) {
  // In Outlook, we use the "Important" flag
  await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${messageId}`)
        .patch({
          importance: important ? "high" : "normal",
        }),
    logger,
  );
}

export async function getOrCreateInboxZeroLabel({
  client,
  key,
  logger,
}: {
  client: OutlookClient;
  key: InboxZeroLabel;
  logger: Logger;
}) {
  const { name } = inboxZeroLabels[key];
  const labels = await getLabels(client);

  // Return label if it exists
  const label = labels?.find((label) => label.displayName === name);
  if (label) return label;

  // Create label if it doesn't exist
  const createdLabel = await createLabel({ client, name, logger });
  return createdLabel;
}

function assertNoNormalizedInputCollisions(
  entries: {
    rawName: string;
    normalizedName: string;
  }[],
) {
  const normalizedMap = new Map<string, string>();

  entries.forEach(({ rawName, normalizedName }) => {
    const existingRawName = normalizedMap.get(normalizedName);
    if (existingRawName && existingRawName !== rawName) {
      throw new Error(
        `Ambiguous Outlook category names "${existingRawName}" and "${rawName}" normalize to the same value. Please keep category names unique.`,
      );
    }

    if (!existingRawName) normalizedMap.set(normalizedName, rawName);
  });
}
