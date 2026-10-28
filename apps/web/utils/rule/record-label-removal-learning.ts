import { after } from "next/server";
import { GroupItemSource, type SystemType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { shouldLearnFromLabelRemoval } from "@/utils/rule/consts";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";
import {
  removeAiLearnedPattern,
  saveLearnedPattern,
} from "@/utils/rule/learned-patterns";
import {
  RULE_ANALYTICS_EVENTS,
  trackRuleEvent,
} from "@/utils/analytics/rule-events.server";

export async function recordLabelRemovalLearning({
  sender,
  ruleId,
  systemType,
  messageId,
  threadId,
  emailAccountId,
  logger,
}: {
  sender: string | null;
  ruleId: string | null | undefined;
  systemType: SystemType | null | undefined;
  messageId: string;
  threadId?: string | null;
  emailAccountId: string;
  logger: Logger;
}) {
  if (!sender) {
    logger.info("No sender found, skipping learning");
    return;
  }

  // We move conversation status labels ourselves as a thread progresses, so
  // only other rule labels are a signal that the user disagreed with us.
  if (ruleId && !isConversationStatusType(systemType)) {
    after(() =>
      trackRuleEvent({
        emailAccountId,
        event: RULE_ANALYTICS_EVENTS.ruleLabelRemovedByUser,
        properties: { ruleId, systemType: systemType ?? null },
      }),
    );
  }

  if (ruleId && !systemType) {
    // A custom rule's label can be removed as part of a normal workflow, so this
    // isn't strong enough to exclude the sender. It does contradict an AI-inferred
    // sender pattern, which would otherwise keep reapplying the label.
    const removedCount = await removeAiLearnedPattern({
      emailAccountId,
      from: sender,
      ruleId,
    });
    logger.info("Processed custom rule label removal", { removedCount });
    return;
  }

  if (!ruleId || !systemType || !shouldLearnFromLabelRemoval(systemType)) {
    logger.info("Label removal does not match a learnable system rule", {
      systemType,
    });
    return;
  }

  logger.info("Processing label removal for learning", {
    systemType,
  });
  logger.trace("Label removal sender", { from: sender });

  await saveLearnedPattern({
    emailAccountId,
    from: sender,
    ruleId,
    exclude: true,
    logger,
    messageId,
    threadId,
    reason: "Label removed",
    source: GroupItemSource.LABEL_REMOVED,
  });
}
