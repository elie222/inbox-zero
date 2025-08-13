import type { gmail_v1 } from "@googleapis/gmail";
import { publishArchive, type TinybirdEmailAction } from "@inboxzero/tinybird";
import {
  getRandomLabelColor,
  inboxZeroLabels,
  PARENT_LABEL,
  type InboxZeroLabel,
} from "@/utils/label";
import {
  labelVisibility,
  messageVisibility,
  type LabelVisibility,
  type MessageVisibility,
} from "@/utils/gmail/constants";
import { createScopedLogger } from "@/utils/logger";
import { withGmailRetry } from "@/utils/gmail/retry";

const logger = createScopedLogger("gmail/label");

export const GmailLabel = {
  INBOX: "INBOX",
  SENT: "SENT",
  UNREAD: "UNREAD",
  STARRED: "STARRED",
  IMPORTANT: "IMPORTANT",
  SPAM: "SPAM",
  TRASH: "TRASH",
  DRAFT: "DRAFT",
  PERSONAL: "CATEGORY_PERSONAL",
  SOCIAL: "CATEGORY_SOCIAL",
  PROMOTIONS: "CATEGORY_PROMOTIONS",
  FORUMS: "CATEGORY_FORUMS",
  UPDATES: "CATEGORY_UPDATES",
};

export async function labelThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const { gmail, threadId, addLabelIds, removeLabelIds } = options;

  if (!addLabelIds?.length && !removeLabelIds?.length) {
    logger.warn("No labels to add or remove", { threadId });
    return;
  }

  logger.trace("Labeling thread", { threadId, addLabelIds, removeLabelIds });

  return withGmailRetry(() =>
    gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: {
        addLabelIds,
        removeLabelIds,
      },
    }),
  );
}

export async function removeThreadLabel(
  gmail: gmail_v1.Gmail,
  threadId: string,
  labelId: string,
) {
  await labelThread({
    gmail,
    threadId,
    removeLabelIds: [labelId],
  });
}

export async function archiveThread({
  gmail,
  threadId,
  ownerEmail,
  actionSource,
  labelId,
}: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  ownerEmail: string;
  actionSource: TinybirdEmailAction["actionSource"];
  labelId?: string;
}) {
  const archivePromise = gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      removeLabelIds: [GmailLabel.INBOX],
      ...(labelId ? { addLabelIds: [labelId] } : {}),
    },
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

export async function labelMessage({
  gmail,
  messageId,
  addLabelIds,
  removeLabelIds,
}: {
  gmail: gmail_v1.Gmail;
  messageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  return gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: { addLabelIds, removeLabelIds },
  });
}

export async function markReadThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  read: boolean;
}) {
  const { gmail, threadId, read } = options;

  return gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: read
      ? {
          removeLabelIds: [GmailLabel.UNREAD],
        }
      : {
          addLabelIds: [GmailLabel.UNREAD],
        },
  });
}

export async function markImportantMessage(options: {
  gmail: gmail_v1.Gmail;
  messageId: string;
  important: boolean;
}) {
  const { gmail, messageId, important } = options;

  return gmail.users.messages.modify({
    userId: "me",
    id: messageId,
    requestBody: important
      ? {
          addLabelIds: [GmailLabel.IMPORTANT],
        }
      : {
          removeLabelIds: [GmailLabel.IMPORTANT],
        },
  });
}

export async function createLabel({
  gmail,
  name,
  messageListVisibility,
  labelListVisibility,
  color,
}: {
  gmail: gmail_v1.Gmail;
  name: string;
  messageListVisibility?: MessageVisibility;
  labelListVisibility?: LabelVisibility;
  color?: string;
}) {
  try {
    const createdLabel = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        messageListVisibility,
        labelListVisibility,
        color: color
          ? { backgroundColor: color, textColor: "#000000" }
          : { backgroundColor: getRandomLabelColor(), textColor: "#000000" },
      },
    });
    return createdLabel.data;
  } catch (error) {
    const errorMessage: string | undefined = (error as any).message;

    // Handle label already exists case
    // May be happening due to a race condition where the label was created between the list and create?
    if (errorMessage?.includes("Label name exists or conflicts")) {
      logger.warn("Label already exists", { name });
      const label = await getLabel({ gmail, name });
      if (label) return label;
      throw new Error(`Label conflict but not found: ${name}`);
    }

    // Handle invalid label name case
    if (errorMessage?.includes("Invalid label name"))
      throw new Error(`Invalid Gmail label name: "${name}"`);

    // Handle other errors with label name context
    throw new Error(`Failed to create Gmail label "${name}": ${errorMessage}`);
  }
}

export async function getLabels(gmail: gmail_v1.Gmail) {
  const response = await gmail.users.labels.list({ userId: "me" });
  return response.data.labels;
}

function normalizeLabel(name: string) {
  return name
    .toLowerCase()
    .replace(/[-_.]/g, " ") // replace hyphens, underscores, dots with spaces
    .replace(/\s+/g, " ") // multiple spaces to single space
    .replace(/^\/+|\/+$/g, "") // trim slashes
    .trim();
}

export async function getLabel(options: {
  gmail: gmail_v1.Gmail;
  name: string;
}) {
  const { gmail, name } = options;
  const labels = await getLabels(gmail);

  const normalizedSearch = normalizeLabel(name);

  return labels?.find(
    (label) => label.name && normalizeLabel(label.name) === normalizedSearch,
  );
}

export async function getLabelById(options: {
  gmail: gmail_v1.Gmail;
  id: string;
}) {
  const { gmail, id } = options;
  return (await gmail.users.labels.get({ userId: "me", id })).data;
}

export async function getOrCreateLabel({
  gmail,
  name,
}: {
  gmail: gmail_v1.Gmail;
  name: string;
}) {
  if (!name?.trim()) throw new Error("Label name cannot be empty");
  const label = await getLabel({ gmail, name });
  if (label) return label;
  const createdLabel = await createLabel({ gmail, name });
  return createdLabel;
}

// More efficient way to get or create multiple labels, so we fetch labels only once
export async function getOrCreateLabels({
  gmail,
  names,
}: {
  gmail: gmail_v1.Gmail;
  names: string[];
}): Promise<gmail_v1.Schema$Label[]> {
  if (!names.length) return [];

  // Validate names
  const emptyNames = names.filter((name) => !name?.trim());
  if (emptyNames.length) throw new Error("Label names cannot be empty");

  // Fetch labels once
  const existingLabels = (await getLabels(gmail)) || [];
  const normalizedNames = names.map(normalizeLabel);

  // Find existing labels
  const labelMap = new Map<string, gmail_v1.Schema$Label>();
  existingLabels.forEach((label) => {
    if (label.name) {
      labelMap.set(normalizeLabel(label.name), label);
    }
  });

  // Create missing labels
  const results = await Promise.all(
    normalizedNames.map(async (normalizedName, index) => {
      const existingLabel = labelMap.get(normalizedName);
      if (existingLabel) return existingLabel;

      return createLabel({ gmail, name: names[index] });
    }),
  );

  return results;
}

export async function getOrCreateInboxZeroLabel({
  gmail,
  key,
}: {
  gmail: gmail_v1.Gmail;
  key: InboxZeroLabel;
}) {
  const { name, color, messageListVisibility } = inboxZeroLabels[key];
  const labels = await getLabels(gmail);

  // Create parent label if it doesn't exist
  const parentLabel = labels?.find((label) => PARENT_LABEL === label.name);
  if (!parentLabel) {
    try {
      await createLabel({ gmail, name: PARENT_LABEL });
    } catch {
      logger.warn("Parent label already exists", { name: PARENT_LABEL });
    }
  }

  // Return child label if it exists
  const label = labels?.find((label) => label.name === name);
  if (label) return label;

  // Create child label if it doesn't exist
  const createdLabel = await createLabel({
    gmail,
    name,
    messageListVisibility: messageListVisibility || messageVisibility.hide,
    labelListVisibility: labelVisibility.labelShow,
    color,
  });
  return createdLabel;
}
