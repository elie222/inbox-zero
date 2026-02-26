import { GroupItemSource, type SystemType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import { shouldLearnFromLabelRemoval } from "@/utils/rule/consts";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";

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
