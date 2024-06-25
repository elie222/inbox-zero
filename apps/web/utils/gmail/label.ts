import type { gmail_v1 } from "googleapis";

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

export async function archiveThread(options: {
  gmail: gmail_v1.Gmail;
  threadId: string;
}) {
  const { gmail, threadId } = options;

  return gmail.users.threads.modify({
    userId: "me",
    id: threadId,
    requestBody: {
      removeLabelIds: [INBOX_LABEL_ID],
    },
  });
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

export async function createLabel(options: {
  gmail: gmail_v1.Gmail;
  name: string;
}) {
  const { gmail, name } = options;
  return gmail.users.labels.create({
    userId: "me",
    requestBody: { name },
  });
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
  const label = await getLabel({ gmail, name });
  if (label) return label;
  const createdLabel = await createLabel({ gmail, name });
  return createdLabel.data;
}
