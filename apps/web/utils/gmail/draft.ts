import type { gmail_v1 } from "@googleapis/gmail";
import { createScopedLogger } from "@/utils/logger";
import { parseMessage } from "@/utils/gmail/message";
import type { MessageWithPayload } from "@/utils/types";
import { isGmailError } from "@/utils/error";
import { withGmailRetry } from "@/utils/gmail/retry";

const logger = createScopedLogger("gmail/draft");

export async function getDraft(draftId: string, gmail: gmail_v1.Gmail) {
  try {
    logger.info("Fetching draft", { draftId });
    const response = await withGmailRetry(() =>
      gmail.users.drafts.get({
        userId: "me",
        id: draftId,
        format: "full",
      }),
    );

    logger.info("Draft API response received", {
      draftId,
      responseDraftId: response.data.id,
      embeddedMessageId: response.data.message?.id,
      embeddedThreadId: response.data.message?.threadId,
    });

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

/**
 * Validates that a draft ID has the expected format.
 * Gmail draft IDs start with 'r-' followed by numbers (e.g., 'r-2497042748957023124').
 * This helps prevent accidentally passing a message ID to the draft delete API.
 */
function isValidGmailDraftId(draftId: string): boolean {
  return /^r-\d+$/.test(draftId);
}

export async function sendDraft(
  gmail: gmail_v1.Gmail,
  draftId: string,
): Promise<{ messageId: string; threadId: string }> {
  logger.info("Sending draft", { draftId });

  const response = await withGmailRetry(() =>
    gmail.users.drafts.send({
      userId: "me",
      requestBody: {
        id: draftId,
      },
    }),
  );

  const messageId = response.data.id;
  const threadId = response.data.threadId;

  if (!messageId || !threadId) {
    throw new Error("Failed to send draft: missing messageId or threadId");
  }

  logger.info("Draft sent successfully", { draftId, messageId, threadId });

  return { messageId, threadId };
}

export async function deleteDraft(gmail: gmail_v1.Gmail, draftId: string) {
  // Log detailed info about the draft ID format for debugging
  logger.info("Attempting to delete draft", {
    draftId,
    draftIdLength: draftId.length,
    startsWithR: draftId.startsWith("r-"),
    isValidFormat: isValidGmailDraftId(draftId),
  });

  // Warn but don't block if draft ID format is unexpected
  // This helps us identify potential issues without breaking functionality
  if (!isValidGmailDraftId(draftId)) {
    logger.warn(
      "Draft ID does not match expected Gmail format (r-NNNNN). This may indicate an issue.",
      { draftId },
    );
  }

  try {
    const response = await withGmailRetry(() =>
      gmail.users.drafts.delete({
        userId: "me",
        id: draftId,
      }),
    );
    if (response.status !== 200 && response.status !== 204) {
      logger.error("Unexpected response status from draft deletion", {
        draftId,
        status: response.status,
      });
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
