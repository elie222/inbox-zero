import type { gmail_v1 } from "@googleapis/gmail";
import { GmailLabel } from "@/utils/gmail/label";
import { extractErrorInfo, withGmailRetry } from "@/utils/gmail/retry";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";

export async function createFilter(options: {
  gmail: gmail_v1.Gmail;
  from: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
  logger: Logger;
}) {
  const { gmail, from, addLabelIds, removeLabelIds, logger } = options;

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

    const errorInfo = extractErrorInfo(error);

    logger.error("Failed to create Gmail filter", {
      from,
      addLabelIds,
      removeLabelIds,
      error,
    });

    // Check if it might be a filter limit issue
    if (errorInfo.status === 500) {
      try {
        const filters = await getFiltersList({ gmail });
        const filterCount = filters.data?.filter?.length ?? 0;
        if (filterCount >= 990) {
          throw new SafeError(
            `Gmail filter limit reached (${filterCount}/1000 filters). Please delete some existing filters in Gmail settings.`,
          );
        }
      } catch (limitCheckError) {
        if (limitCheckError instanceof SafeError) throw limitCheckError;
        // If limit check fails, just log and continue with original error
        logger.warn("Failed to check filter count", { error: limitCheckError });
      }
    }

    throw error;
  }
}

export async function createAutoArchiveFilter({
  gmail,
  from,
  gmailLabelId,
  logger,
}: {
  gmail: gmail_v1.Gmail;
  from: string;
  gmailLabelId?: string;
  logger: Logger;
}) {
  try {
    return await createFilter({
      gmail,
      from,
      removeLabelIds: [GmailLabel.INBOX],
      addLabelIds: gmailLabelId ? [gmailLabelId] : undefined,
      logger,
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
