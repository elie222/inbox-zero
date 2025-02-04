import type { gmail_v1 } from "@googleapis/gmail";
import {
  labelMessage,
  labelThread,
  getOrCreateLabels,
} from "@/utils/gmail/label";

export const NEEDS_REPLY_LABEL_NAME = "To Reply";
const AWAITING_REPLY_LABEL_NAME = "Awaiting Reply";

export async function labelAwaitingReply(
  gmail: gmail_v1.Gmail,
  messageId: string,
  awaitingReplyLabelId: string,
) {
  await labelMessage({
    gmail,
    messageId,
    addLabelIds: [awaitingReplyLabelId],
  });
}

export async function removeAwaitingReplyLabel(
  gmail: gmail_v1.Gmail,
  threadId: string,
  awaitingReplyLabelId: string,
) {
  await labelThread({
    gmail,
    threadId,
    removeLabelIds: [awaitingReplyLabelId],
  });
}

export async function labelNeedsReply(
  gmail: gmail_v1.Gmail,
  messageId: string,
  needsReplyLabelId: string,
) {
  await labelMessage({
    gmail,
    messageId,
    addLabelIds: [needsReplyLabelId],
  });
}

export async function removeNeedsReplyLabel(
  gmail: gmail_v1.Gmail,
  threadId: string,
  needsReplyLabelId: string,
) {
  await labelThread({
    gmail,
    threadId,
    removeLabelIds: [needsReplyLabelId],
  });
}

export async function getReplyTrackingLabels(gmail: gmail_v1.Gmail): Promise<{
  awaitingReplyLabelId: string;
  needsReplyLabelId: string;
}> {
  const [awaitingReplyLabel, needsReplyLabel] = await getOrCreateLabels({
    gmail,
    names: [AWAITING_REPLY_LABEL_NAME, NEEDS_REPLY_LABEL_NAME],
  });

  return {
    awaitingReplyLabelId: awaitingReplyLabel.id || "",
    needsReplyLabelId: needsReplyLabel.id || "",
  };
}
