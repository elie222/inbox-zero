import type { gmail_v1 } from "@googleapis/gmail";
import { publishArchive, type TinybirdEmailAction } from "@inboxzero/tinybird";

export const INBOX_LABEL_ID = "INBOX";
export const SENT_LABEL_ID = "SENT";
export const UNREAD_LABEL_ID = "UNREAD";
export const STARRED_LABEL_ID = "STARRED";
export const IMPORTANT_LABEL_ID = "IMPORTANT";
export const SPAM_LABEL_ID = "SPAM";
export const TRASH_LABEL_ID = "TRASH";
export const DRAFT_LABEL_ID = "DRAFT";

export async function labelThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const { gmail, threadId, addLabelIds, removeLabelIds } = options;

  return gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      addLabelIds,
      removeLabelIds,
    },
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
      removeLabelIds: [INBOX_LABEL_ID],
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
    console.error(
      `Failed to archive thread: ${threadId}`,
      archiveResult.reason,
    );
    throw archiveResult.reason;
  }

  if (publishResult.status === "rejected") {
    console.error(
      `Failed to publish archive action: ${threadId}`,
      publishResult.reason,
    );
  }

  return archiveResult.value;
}

export async function labelMessage(options: {
  gmail: gmail_v1.Gmail;
  messageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const { gmail, messageId, addLabelIds, removeLabelIds } = options;

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
          removeLabelIds: [UNREAD_LABEL_ID],
        }
      : {
          addLabelIds: [UNREAD_LABEL_ID],
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
          addLabelIds: [IMPORTANT_LABEL_ID],
        }
      : {
          removeLabelIds: [IMPORTANT_LABEL_ID],
        },
  });
}

async function createLabel({
  gmail,
  name,
}: {
  gmail: gmail_v1.Gmail;
  name: string;
}) {
  try {
    const createdLabel = await gmail.users.labels.create({
      userId: "me",
      requestBody: { name },
    });
    return createdLabel.data;
  } catch (error) {
    // May be happening due to a race condition where the label was created between the list and create?
    if ((error as any).message?.includes("Label name exists or conflicts")) {
      console.warn(`Label already exists: ${name}`);
      const label = await getLabel({ gmail, name });
      if (label) return label;
      console.error(`Label not found: ${name}`);
      throw error;
    }
    throw error;
  }
}

export async function getLabels(gmail: gmail_v1.Gmail) {
  return (await gmail.users.labels.list({ userId: "me" })).data.labels;
}

export async function getLabel(options: {
  gmail: gmail_v1.Gmail;
  name: string;
}) {
  const { gmail, name } = options;
  const labels = await getLabels(gmail);
  return labels?.find((label) => label.name === name);
}

export async function getOrCreateLabel(options: {
  gmail: gmail_v1.Gmail;
  name: string;
}) {
  const { gmail, name } = options;
  if (!name?.trim()) throw new Error("Label name cannot be empty");
  const label = await getLabel({ gmail, name });
  if (label) return label;
  const createdLabel = await createLabel({ gmail, name });
  return createdLabel;
}
