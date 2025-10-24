import type { gmail_v1 } from "@googleapis/gmail";
import { GaxiosError } from "gaxios";
import { GmailLabel } from "@/utils/gmail/label";

export async function createFilter(options: {
  gmail: gmail_v1.Gmail;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const { gmail, from, addLabelIds, removeLabelIds } = options;

  try {
    return await gmail.users.settings.filters.create({
      userId: "me",
      requestBody: {
        criteria: { from },
        action: {
          addLabelIds,
          removeLabelIds,
        },
      },
    });
  } catch (error) {
    if (isFilterExistsError(error)) return { status: 200 };
    throw error;
  }
}

export async function createAutoArchiveFilter({
  gmail,
  from,
  gmailLabelId,
}: {
  gmail: gmail_v1.Gmail;
  from: string;
  gmailLabelId?: string;
}) {
  try {
    return await createFilter({
      gmail,
      from,
      removeLabelIds: [GmailLabel.INBOX],
      addLabelIds: gmailLabelId ? [gmailLabelId] : undefined,
    });
  } catch (error) {
    if (isFilterExistsError(error)) return { status: 200 };
    throw error;
  }
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

function isFilterExistsError(error: unknown): error is GaxiosError {
  return (
    error instanceof GaxiosError &&
    error.message.includes("Filter already exists")
  );
}
