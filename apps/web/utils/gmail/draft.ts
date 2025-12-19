import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import { parseMessage } from "@/utils/gmail/message";
import type { MessageWithPayload } from "@/utils/types";
import { isGmailError } from "@/utils/error";
import { withGmailRetry } from "@/utils/gmail/retry";

const logger = createScopedLogger("gmail/draft");

export async function getDraft(draftId: string, gmail: gmail_v1.Gmail) {
  try {
    const response = await withGmailRetry(() =>
      gmail.users.drafts.get({
        userId: "me",
        id: draftId,
        format: "full",
      }),
    );
    const message = parseMessage(response.data.message as MessageWithPayload);
    return message;
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.info("Draft not found, returning null.", { draftId });
      return null;
    }
    throw error;
  }
}

function isNotFoundError(error: unknown): boolean {
  if (isGmailError(error) && error.code === 404) return true;

  // biome-ignore lint/suspicious/noExplicitAny: simple
  const err = error as any;

  const statusCode =
    err.response?.data?.error?.code ??
    err.response?.status ??
    err.status ??
    err.code ??
    err.error?.response?.data?.error?.code ??
    err.error?.response?.status ??
    err.error?.status ??
    err.error?.code;

  return statusCode === 404;
}

export async function deleteDraft(gmail: gmail_v1.Gmail, draftId: string) {
  try {
    logger.info("Deleting draft", { draftId });
    const response = await withGmailRetry(() =>
      gmail.users.drafts.delete({
        userId: "me",
        id: draftId,
      }),
    );
    if (response.status !== 200 && response.status !== 204) {
      logger.error("Failed to delete draft", { draftId, response });
    }
    logger.info("Successfully deleted draft", { draftId });
  } catch (error) {
    if (isNotFoundError(error)) {
      logger.warn("Draft not found or already deleted, skipping deletion.", {
        draftId,
      });
    } else {
      logger.error("Failed to delete draft", { draftId, error });
      throw error;
    }
  }
}
