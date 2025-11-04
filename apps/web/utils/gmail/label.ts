import type { gmail_v1 } from "@googleapis/gmail";
import { publishArchive, type TinybirdEmailAction } from "@inboxzero/tinybird";
import {
  getLabelColor,
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
import { extractErrorInfo, withGmailRetry } from "@/utils/gmail/retry";

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
  const { gmail, threadId } = options;

  // Filter out empty/invalid label IDs
  const addLabelIds = options.addLabelIds?.filter((id) => id?.trim());
  const removeLabelIds = options.removeLabelIds?.filter((id) => id?.trim());

  if (!addLabelIds?.length && !removeLabelIds?.length) {
    logger.warn("No valid labels to add or remove", { threadId });
    return;
  }

  logger.trace("Labeling thread", { threadId, addLabelIds, removeLabelIds });

  try {
    return await withGmailRetry(() =>
      gmail.users.threads.modify({
        userId: "me",
        id: threadId,
        requestBody: {
          addLabelIds,
          removeLabelIds,
        },
      }),
    );
  } catch (error) {
    const { status, reason, errorMessage } = extractErrorInfo(error);
    const lowerMessage = errorMessage.toLowerCase();
    const isRemovalOnly =
      !addLabelIds?.length && Boolean(removeLabelIds?.length);

    const isMissingLabelError =
      lowerMessage.includes("not found") ||
      lowerMessage.includes("invalid label") ||
      reason === "notFound" ||
      status === 404;

    const isInvalidRemoval =
      status === 400 &&
      ["invalidArgument", "failedPrecondition", "badRequest"].includes(
        reason?.toString() ?? "",
      );

    if (isRemovalOnly && (isMissingLabelError || isInvalidRemoval)) {
      logger.error("Skipping label removal for non-existent label", {
        threadId,
        removeLabelIds,
        status,
        reason,
        error: errorMessage,
      });
      return;
    }

    // Re-throw other errors
    throw error;
  }
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
  const archivePromise = withGmailRetry(() =>
    gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: {
        removeLabelIds: [GmailLabel.INBOX],
        ...(labelId ? { addLabelIds: [labelId] } : {}),
      },
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
  return withGmailRetry(() =>
    gmail.users.messages.modify({
      userId: "me",
      id: messageId,
      requestBody: { addLabelIds, removeLabelIds },
    }),
  );
}

export async function markReadThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  read: boolean;
}) {
  const { gmail, threadId, read } = options;

  return withGmailRetry(() =>
    gmail.users.threads.modify({
      userId: "me",
      id: threadId,
      requestBody: read
        ? {
            removeLabelIds: [GmailLabel.UNREAD],
          }
        : {
            addLabelIds: [GmailLabel.UNREAD],
          },
    }),
  );
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
  await ensureParentLabelsExist(gmail, name);

  try {
    const createdLabel = await gmail.users.labels.create({
      userId: "me",
      requestBody: {
        name,
        messageListVisibility,
        labelListVisibility,
        color: {
          backgroundColor: color || getLabelColor(name),
          textColor: "#000000",
        },
      },
    });
    return createdLabel.data;
  } catch (error) {
    const errorMessage: string | undefined = (error as any).message;

    if (errorMessage?.includes("Label name exists or conflicts")) {
      logger.warn("Label already exists", { name });
      const label = await getLabel({ gmail, name });
      if (label) return label;
      throw new Error(`Label conflict but not found: ${name}`);
    }

    if (errorMessage?.includes("Invalid label name"))
      throw new Error(`Invalid Gmail label name: "${name}"`);

    throw new Error(`Failed to create Gmail label "${name}": ${errorMessage}`);
  }
}

/**
 * Ensures all parent labels exist for a nested label
 * For "Work/Projects/2024", creates "Work" and "Work/Projects" if they don't exist
 */
async function ensureParentLabelsExist(gmail: gmail_v1.Gmail, name: string) {
  if (!name.includes("/")) return;

  const parts = name.split("/");
  // Build up parent paths: ["Work", "Work/Projects", "Work/Projects/2024"]
  // We only need to check/create up to the second-to-last part
  for (let i = 1; i < parts.length; i++) {
    const parentPath = parts.slice(0, i).join("/");
    const exists = await getLabel({ gmail, name: parentPath });
    if (!exists) {
      await createLabel({ gmail, name: parentPath });
    }
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
