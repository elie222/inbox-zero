import type { gmail_v1 } from "@googleapis/gmail";
import { labelMessage, labelThread } from "@/utils/gmail/label";

// This comes from the action:
const NEEDS_REPLY_LABEL = "To Reply";
// Check Redis for the id:
const AWAITING_REPLY_LABEL = "Awaiting Reply";

export async function labelAwaitingReply(
  gmail: gmail_v1.Gmail,
  messageId: string,
) {
  await labelMessage({
    gmail,
    messageId,
    addLabelIds: [AWAITING_REPLY_LABEL],
  });
}

export async function removeAwaitingReplyLabel(
  gmail: gmail_v1.Gmail,
  threadId: string,
) {
  await labelThread({
    gmail,
    threadId,
    removeLabelIds: [AWAITING_REPLY_LABEL],
  });
}

export async function labelNeedsReply(
  gmail: gmail_v1.Gmail,
  messageId: string,
) {
  await labelMessage({
    gmail,
    messageId,
    addLabelIds: [NEEDS_REPLY_LABEL],
  });
}

export async function removeNeedsReplyLabel(
  gmail: gmail_v1.Gmail,
  threadId: string,
) {
  await labelThread({
    gmail,
    threadId,
    removeLabelIds: [NEEDS_REPLY_LABEL],
  });
}
