import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Logger } from "@/utils/logger";
import { convertMessage } from "@/utils/outlook/message";
import { withOutlookRetry } from "@/utils/outlook/retry";

export async function getDraft({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}) {
  try {
    const response: Message = await withOutlookRetry(
      () => client.getClient().api(`/me/messages/${draftId}`).get(),
      logger,
    );
    const message = convertMessage(response);
    return message;
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.info("Draft not found, returning null.", { draftId });
      return null;
    }

    throw error;
  }
}

export async function deleteDraft({
  client,
  draftId,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  logger: Logger;
}) {
  try {
    logger.info("Deleting draft", { draftId });
    await withOutlookRetry(
      () => client.getClient().api(`/me/messages/${draftId}`).delete(),
      logger,
    );
    logger.info("Successfully deleted draft", { draftId });
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("Draft not found or already deleted, skipping deletion.", {
        draftId,
      });
      return;
    }

    logger.error("Failed to delete draft", { draftId, error });
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  const err = error as {
    statusCode?: number;
    code?: number | string;
    message?: string;
  };

  // Check error code
  if (
    err?.statusCode === 404 ||
    err?.code === 404 ||
    err?.code === "ErrorItemNotFound" ||
    err?.code === "itemNotFound"
  ) {
    return true;
  }

  if (
    err?.message?.includes("not found in the store") ||
    err?.message?.includes("ErrorItemNotFound")
  ) {
    return true;
  }

  return false;
}
