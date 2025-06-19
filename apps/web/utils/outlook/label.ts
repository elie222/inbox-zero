import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { publishArchive, type TinybirdEmailAction } from "@inboxzero/tinybird";
import { inboxZeroLabels, type InboxZeroLabel } from "@/utils/label";

const logger = createScopedLogger("outlook/label");

// Define our own Category type since Microsoft Graph types don't export it
interface OutlookCategory {
  id: string;
  displayName?: string;
  color?: string;
}

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
  const response = await client
    .getClient()
    .api("/me/outlook/masterCategories")
    .get();
  return (response.value as OutlookCategory[]).map((label) => ({
    ...label,
    name: label.displayName || label.id,
  }));
}

export async function getLabelById(options: {
  client: OutlookClient;
  id: string;
}) {
  const { client, id } = options;
  const response = await client
    .getClient()
    .api(`/me/outlook/masterCategories/${id}`)
    .get();
  return response as OutlookCategory;
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

    const response = await client
      .getClient()
      .api("/me/outlook/masterCategories")
      .post({
        displayName: name,
        color: outlookColor,
      });
    return response as OutlookCategory;
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
  const messages = await client
    .getClient()
    .api(`/me/messages`)
    .filter(`conversationId eq '${threadId}'`)
    .get();

  await Promise.all(
    messages.value.map((message: { id: string }) =>
      labelMessage({ client, messageId: message.id, categories }),
    ),
  );
}

export async function archiveThread({
  client,
  threadId,
  ownerEmail,
  actionSource,
  labelId,
}: {
  client: OutlookClient;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  labelId?: string;
}) {
  // In Outlook, archiving is moving to the Archive folder
  const archivePromise = client
    .getClient()
    .api(`/me/messages/${threadId}/move`)
    .post({
      destinationId: "archive",
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

  if (archiveResult.status === "rejected") {
    const error = archiveResult.reason as Error;
    if (error.message?.includes("Requested entity was not found")) {
      logger.warn("Thread not found", { threadId, userEmail: ownerEmail });
      return { status: 404, message: "Thread not found" };
    }
    logger.error("Failed to archive thread", { threadId, error });
    throw error;
  }

  if (publishResult.status === "rejected") {
    logger.error("Failed to publish archive action", {
      threadId,
      error: publishResult.reason,
    });
  }

  return archiveResult.value;
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
  // In Outlook, we mark messages as read
  await client.getClient().api(`/me/messages/${threadId}`).patch({
    isRead: read,
  });
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
