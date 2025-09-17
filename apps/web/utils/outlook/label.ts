import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { publishArchive, type TinybirdEmailAction } from "@inboxzero/tinybird";
import { WELL_KNOWN_FOLDERS } from "./message";

import { inboxZeroLabels, type InboxZeroLabel } from "@/utils/label";
import type {
  OutlookCategory,
  Message,
} from "@microsoft/microsoft-graph-types";

const logger = createScopedLogger("outlook/label");

// Outlook doesn't have system labels like Gmail, but we map common categories
// Using same format as Gmail for consistency
export const OutlookLabel = {
  INBOX: "INBOX",
  SENT: "SENT",
  UNREAD: "UNREAD",
  STARRED: "STARRED",
  IMPORTANT: "IMPORTANT",
  SPAM: "SPAM",
  TRASH: "TRASH",
  DRAFT: "DRAFT",
  ARCHIVE: "ARCHIVE",
} as const;

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
}: {
  client: OutlookClient;
  name: string;
  color?: string;
}) {
  try {
    // Use a random preset color if none provided or if the provided color is not supported
    const outlookColor =
      color && OUTLOOK_COLORS.includes(color)
        ? color
        : OUTLOOK_COLORS[Math.floor(Math.random() * OUTLOOK_COLORS.length)];

    const response: OutlookCategory = await client
      .getClient()
      .api("/me/outlook/masterCategories")
      .post({
        displayName: name,
        color: outlookColor,
      });
    return response;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    if (errorMessage.includes("already exists")) {
      logger.warn("Label already exists", { name });
      const label = await getLabel({ client, name });
      if (label) return label;
      throw new Error(`Label conflict but not found: ${name}`);
    }
    throw new Error(
      `Failed to create Outlook category "${name}": ${errorMessage}`,
    );
  }
}

function normalizeLabel(name: string) {
  return name
    .toLowerCase()
    .replace(/[-_.]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^\/+|\/+$/g, "")
    .trim();
}

export async function getLabel(options: {
  client: OutlookClient;
  name: string;
}) {
  const { client, name } = options;
  const labels = await getLabels(client);
  const normalizedSearch = normalizeLabel(name);

  return labels?.find(
    (label) =>
      label.displayName &&
      normalizeLabel(label.displayName) === normalizedSearch,
  );
}

export async function getOrCreateLabel({
  client,
  name,
}: {
  client: OutlookClient;
  name: string;
}) {
  if (!name?.trim()) throw new Error("Label name cannot be empty");
  const label = await getLabel({ client, name });
  if (label) return label;
  const createdLabel = await createLabel({ client, name });
  return createdLabel;
}

export async function getOrCreateLabels({
  client,
  names,
}: {
  client: OutlookClient;
  names: string[];
}): Promise<OutlookCategory[]> {
  if (!names.length) return [];

  const emptyNames = names.filter((name) => !name?.trim());
  if (emptyNames.length) throw new Error("Label names cannot be empty");

  const existingLabels = await getLabels(client);
  const normalizedNames = names.map(normalizeLabel);

  const labelMap = new Map<string, OutlookCategory>();
  existingLabels.forEach((label) => {
    if (label.displayName) {
      labelMap.set(normalizeLabel(label.displayName), label);
    }
  });

  const results = await Promise.all(
    normalizedNames.map(async (normalizedName, index) => {
      const existingLabel = labelMap.get(normalizedName);
      if (existingLabel) return existingLabel;

      return createLabel({ client, name: names[index] });
    }),
  );

  return results;
}

// Label message/thread functions
export async function labelMessage({
  client,
  messageId,
  categories,
}: {
  client: OutlookClient;
  messageId: string;
  categories: string[];
}) {
  return client.getClient().api(`/me/messages/${messageId}`).patch({
    categories,
  });
}

export async function labelThread({
  client,
  threadId,
  categories,
}: {
  client: OutlookClient;
  threadId: string;
  categories: string[];
}) {
  // In Outlook, we need to update each message in the thread
  // Escape single quotes in threadId for the filter
  const escapedThreadId = threadId.replace(/'/g, "''");
  const messages: { value: Message[] } = await client
    .getClient()
    .api("/me/messages")
    .filter(`conversationId eq '${escapedThreadId}'`)
    .get();

  await Promise.all(
    messages.value.map((message) =>
      labelMessage({ client, messageId: message.id!, categories }),
    ),
  );
}

// Doesn't use pagination. But this function not really used anyway. Can add in the future of needed.
export async function removeThreadLabel({
  client,
  threadId,
  categoryName,
}: {
  client: OutlookClient;
  threadId: string;
  categoryName: string;
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
  await Promise.all(
    messages.value.map(
      async (message: { id: string; categories?: string[] }) => {
        if (!message.categories || !message.categories.includes(categoryName)) {
          return; // Category not present, nothing to remove
        }

        const updatedCategories = message.categories.filter(
          (cat) => cat !== categoryName,
        );

        try {
          await client
            .getClient()
            .api(`/me/messages/${message.id}`)
            .patch({ categories: updatedCategories });
        } catch (error) {
          logger.warn("Failed to remove category from message", {
            messageId: message.id,
            threadId,
            categoryName,
            error: error instanceof Error ? error.message : error,
          });
        }
      },
    ),
  );
}

export async function archiveThread({
  client,
  threadId,
  ownerEmail,
  actionSource,
  folderId = "archive",
}: {
  client: OutlookClient;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  folderId?: string;
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

    const archivePromise = Promise.all(
      messages.value.map(async (message: { id: string }) => {
        try {
          return await client
            .getClient()
            .api(`/me/messages/${message.id}/move`)
            .post({
              destinationId: folderId,
            });
        } catch (error) {
          logger.warn("Failed to move message to folder", {
            folderId,
            messageId: message.id,
            threadId,
            error: error instanceof Error ? error.message : error,
          });
          return null;
        }
      }),
    );

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

    if (archiveResult.status === "rejected") {
      const error = archiveResult.reason as Error;
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

    if (publishResult.status === "rejected") {
      logger.error("Failed to publish action to move thread to folder", {
        folderId,
        threadId,
        error: publishResult.reason,
      });
    }

    return { status: 200 };
  } catch (error) {
    // If the filter fails, try a different approach
    logger.warn("Filter failed, trying alternative approach", {
      threadId,
      error,
    });

    try {
      // Try to get messages by conversationId using a different endpoint
      const messages = await client
        .getClient()
        .api("/me/messages")
        .select("id")
        .get();

      // Filter messages by conversationId manually
      const threadMessages = messages.value.filter(
        (message: { conversationId: string }) =>
          message.conversationId === threadId,
      );

      if (threadMessages.length > 0) {
        // Move each message in the thread to the destination folder
        const movePromises = threadMessages.map(
          async (message: { id: string }) => {
            try {
              return await client
                .getClient()
                .api(`/me/messages/${message.id}/move`)
                .post({
                  destinationId: folderId,
                });
            } catch (moveError) {
              // Log the error but don't fail the entire operation
              logger.warn("Failed to move message to folder", {
                folderId,
                messageId: message.id,
                threadId,
                error:
                  moveError instanceof Error ? moveError.message : moveError,
              });
              return null;
            }
          },
        );

        await Promise.allSettled(movePromises);
      } else {
        // If no messages found, try treating threadId as a messageId
        await client.getClient().api(`/me/messages/${threadId}/move`).post({
          destinationId: folderId,
        });
      }

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
}: {
  client: OutlookClient;
  threadId: string;
  read: boolean;
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
    await Promise.all(
      messages.value.map((message: { id: string }) =>
        client.getClient().api(`/me/messages/${message.id}`).patch({
          isRead: read,
        }),
      ),
    );
  } catch (error) {
    // If the filter fails, try a different approach
    logger.warn("Filter failed, trying alternative approach", {
      threadId,
      error,
    });

    try {
      // Try to get messages by conversationId using a different endpoint
      const messages = await client
        .getClient()
        .api("/me/messages")
        .select("id")
        .get();

      // Filter messages by conversationId manually
      const threadMessages = messages.value.filter(
        (message: { conversationId: string }) =>
          message.conversationId === threadId,
      );

      if (threadMessages.length > 0) {
        // Update each message in the thread
        await Promise.all(
          threadMessages.map((message: { id: string }) =>
            client.getClient().api(`/me/messages/${message.id}`).patch({
              isRead: read,
            }),
          ),
        );
      } else {
        // If no messages found, try treating threadId as a messageId
        await client.getClient().api(`/me/messages/${threadId}`).patch({
          isRead: read,
        });
      }
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
}: {
  client: OutlookClient;
  messageId: string;
  important: boolean;
}) {
  // In Outlook, we use the "Important" flag
  await client
    .getClient()
    .api(`/me/messages/${messageId}`)
    .patch({
      importance: important ? "high" : "normal",
    });
}

export async function getOrCreateInboxZeroLabel({
  client,
  key,
}: {
  client: OutlookClient;
  key: InboxZeroLabel;
}) {
  const { name } = inboxZeroLabels[key];
  const labels = await getLabels(client);

  // Return label if it exists
  const label = labels?.find((label) => label.displayName === name);
  if (label) return label;

  // Create label if it doesn't exist
  const createdLabel = await createLabel({ client, name });
  return createdLabel;
}
