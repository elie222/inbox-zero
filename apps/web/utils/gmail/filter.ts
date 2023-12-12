import { gmail_v1 } from "googleapis";

async function createFilter(options: {
  gmail: gmail_v1.Gmail;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const { gmail, from, addLabelIds, removeLabelIds } = options;

  return gmail.users.settings.filters.create({
    userId: "me",
    requestBody: {
      criteria: { from },
      action: {
        addLabelIds,
        removeLabelIds,
      },
    },
  });
}

export async function createAutoArchiveFilter(options: {
  gmail: gmail_v1.Gmail;
  from: string;
  gmailLabelId?: string;
}) {
  const { gmail, from, gmailLabelId } = options;

  return createFilter({
    gmail,
    from,
    removeLabelIds: ["INBOX"],
    addLabelIds: gmailLabelId ? [gmailLabelId] : undefined,
  });
}

export async function deleteFilter(options: {
  gmail: gmail_v1.Gmail;
  id: string;
}) {
  const { gmail, id } = options;

  return gmail.users.settings.filters.delete({ userId: "me", id });
}

export async function getFiltersList(options: { gmail: gmail_v1.Gmail }) {
  return options.gmail.users.settings.filters.list({ userId: "me" });
}
