import type { gmail_v1 } from "@googleapis/gmail";
import { GmailLabel } from "@/utils/gmail/label";
import { extractErrorInfo, withGmailRetry } from "@/utils/gmail/retry";

export async function createFilter(options: {
  gmail: gmail_v1.Gmail;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}) {
  const { gmail, from, addLabelIds, removeLabelIds } = options;

  try {
    return await withGmailRetry(() =>
      gmail.users.settings.filters.create({
        userId: "me",
        requestBody: {
          criteria: { from },
          action: {
            addLabelIds,
            removeLabelIds,
          },
        },
      }),
    );
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

  return withGmailRetry(() =>
    gmail.users.settings.filters.delete({ userId: "me", id }),
  );
}

export async function getFiltersList(options: { gmail: gmail_v1.Gmail }) {
  return withGmailRetry(() =>
    options.gmail.users.settings.filters.list({ userId: "me" }),
  );
}

function isFilterExistsError(error: unknown): boolean {
  const { errorMessage } = extractErrorInfo(error);
  return errorMessage.includes("Filter already exists");
}
