import type { OutlookClient } from "@/utils/outlook/client";
import { createScopedLogger } from "@/utils/logger";
import { getRandomLabelColor } from "@/utils/label";

const logger = createScopedLogger("outlook/label");

// Define our own Category type since Microsoft Graph types don't export it
interface OutlookCategory {
  id: string;
  displayName?: string;
  color?: string;
}

// Outlook doesn't have system labels like Gmail, but we map common categories
export const OutlookLabel = {
  INBOX: "Inbox",
  SENT: "Sent Items",
  UNREAD: "Unread",
  STARRED: "Flagged",
  IMPORTANT: "Important",
  SPAM: "Junk Email",
  TRASH: "Deleted Items",
  DRAFT: "Drafts",
};

export async function getLabels(client: OutlookClient) {
  const response = await client
    .getClient()
    .api("/me/outlook/masterCategories")
    .get();
  return response.value as OutlookCategory[];
}

export async function getLabelById(options: {
  gmail: OutlookClient;
  id: string;
}) {
  const { gmail: client, id } = options;
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
    const response = await client
      .getClient()
      .api("/me/outlook/masterCategories")
      .post({
        displayName: name,
        color: color || getRandomLabelColor(),
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
}: {
  client: OutlookClient;
  threadId: string;
}) {
  // In Outlook, archiving is moving to the Archive folder
  await client.getClient().api(`/me/messages/${threadId}/move`).post({
    destinationId: "archive",
  });
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
    isRead: true,
  });
}
