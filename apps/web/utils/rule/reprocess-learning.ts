import {
  ClassificationFeedbackEventType,
  GroupItemSource,
} from "@/generated/prisma/enums";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  findRuleByLabelId,
  saveClassificationFeedback,
} from "@/utils/rule/classification-feedback";
import {
  isEligibleForClassificationFeedback,
  shouldLearnFromLabelRemoval,
} from "@/utils/rule/consts";
import {
  retrainLearnedPatterns,
  saveLearnedPattern,
} from "@/utils/rule/learned-patterns";
import { fetchSenderFromMessage } from "@/utils/webhook/google/fetch-sender-from-message";

/**
 * Records what the user confirmed in the reprocess dialog so filing improves:
 * - "Move to X" pins the sender to the target folder's rule (and clears
 *   conflicting patterns on other rules)
 * - every folder label the confirmation stripped becomes a learned exclusion
 *   on its rule, blocking that rule from touching this sender again
 * Both show up under the rule's Learned patterns where they can be undone.
 */
export async function recordReprocessLearning({
  emailAccountId,
  provider,
  messageId,
  threadId,
  keepLabelId,
  strippedLabelIds,
  knownSender,
  logger,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  messageId: string;
  threadId: string;
  keepLabelId: string | null;
  strippedLabelIds: string[];
  // The caller usually already fetched the thread's messages — pass the
  // sender in to skip a redundant per-message Gmail round trip
  knownSender?: string | null;
  logger: Logger;
}) {
  const sender =
    knownSender ?? (await fetchSenderFromMessage(messageId, provider, logger));
  if (!sender) {
    logger.info("No sender found for reprocess learning, skipping");
    return;
  }

  if (keepLabelId) {
    const rule = await findRuleByLabelId({
      labelId: keepLabelId,
      emailAccountId,
    });
    if (rule) {
      await retrainLearnedPatterns({
        emailAccountId,
        ruleId: rule.id,
        values: [sender],
        logger,
        reason: "Reprocess: user confirmed move",
        messageId,
        threadId,
      });
      if (isEligibleForClassificationFeedback(rule.systemType)) {
        await saveClassificationFeedback({
          emailAccountId,
          sender,
          ruleId: rule.id,
          threadId,
          messageId,
          eventType: ClassificationFeedbackEventType.LABEL_ADDED,
          logger,
        });
      }
    }
  }

  for (const labelId of strippedLabelIds) {
    const rule = await findRuleByLabelId({ labelId, emailAccountId });
    if (!rule || !shouldLearnFromLabelRemoval(rule.systemType)) continue;

    await saveLearnedPattern({
      emailAccountId,
      from: sender,
      ruleId: rule.id,
      exclude: true,
      logger,
      messageId,
      threadId,
      reason: "Reprocess: user moved email out",
      source: GroupItemSource.USER,
    });

    if (isEligibleForClassificationFeedback(rule.systemType)) {
      await saveClassificationFeedback({
        emailAccountId,
        sender,
        ruleId: rule.id,
        threadId,
        messageId,
        eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
        logger,
      });
    }
  }
}
