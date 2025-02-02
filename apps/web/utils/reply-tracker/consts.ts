import type { gmail_v1 } from "@googleapis/gmail";
import { labelMessage } from "@/utils/gmail/label";

const NEEDS_REPLY_LABEL = "To Reply";
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
  messageId: string,
) {
  await labelMessage({
    gmail,
    messageId,
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
  messageId: string,
) {
  await labelMessage({
    gmail,
    messageId,
    removeLabelIds: [NEEDS_REPLY_LABEL],
  });
}
