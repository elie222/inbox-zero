import type { gmail_v1 } from "@googleapis/gmail";
import { getOrCreateLabels } from "@/utils/gmail/label";
import {
  NEEDS_REPLY_LABEL_NAME,
  AWAITING_REPLY_LABEL_NAME,
} from "@/utils/reply-tracker/consts";

export async function getAwaitingReplyLabel(
  gmail: gmail_v1.Gmail,
): Promise<string> {
  const [awaitingReplyLabel] = await getOrCreateLabels({
    gmail,
    names: [AWAITING_REPLY_LABEL_NAME],
  });
  return awaitingReplyLabel.id || "";
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
