import {
  ActionType,
  GroupItemSource,
  GroupItemType,
} from "@/generated/prisma/enums";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import { createRuleWithResolvedActions } from "@/utils/rule/rule";

const DELETE_RULE_NAME = "Delete";

/**
 * Files a sender under one rule. saveLearnedPattern creates the group, upserts
 * the pattern and evicts the sender from every other rule.
 */
export async function moveTrainedSender({
  emailAccountId,
  sender,
  ruleId,
  logger,
}: {
  emailAccountId: string;
  sender: string;
  ruleId: string;
  logger: Logger;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId },
    select: { id: true },
  });
  if (!rule) throw new SafeError("Rule not found");

  await saveLearnedPattern({
    emailAccountId,
    from: sender,
    ruleId,
    exclude: false,
    logger,
    reason: "Moved by user",
    source: GroupItemSource.USER,
  });
}

/** Drops the sender from every rule it was trained into. Exclusions stay. */
export async function forgetTrainedSender({
  emailAccountId,
  sender,
  logger,
}: {
  emailAccountId: string;
  sender: string;
  logger: Logger;
}) {
  const { count } = await prisma.groupItem.deleteMany({
    where: {
      type: GroupItemType.FROM,
      value: sender,
      exclude: false,
      group: { emailAccountId },
    },
  });

  logger.info("Forgot trained sender", { count });
}

/**
 * Trains a sender into the account's delete rule (a rule whose only action
 * is DELETE), creating that rule on first use. Delete moves mail to trash.
 */
export async function trainSenderToDelete({
  emailAccountId,
  sender,
  logger,
}: {
  emailAccountId: string;
  sender: string;
  logger: Logger;
}) {
  const ruleId = await findOrCreateDeleteRule({ emailAccountId, logger });
  await moveTrainedSender({ emailAccountId, sender, ruleId, logger });
}

async function findOrCreateDeleteRule({
  emailAccountId,
  logger,
}: {
  emailAccountId: string;
  logger: Logger;
}): Promise<string> {
  const rules = await prisma.rule.findMany({
    where: {
      emailAccountId,
      enabled: true,
      actions: { some: { type: ActionType.DELETE } },
    },
    select: { id: true, actions: { select: { type: true } } },
  });
  const existing = rules.find((rule) =>
    rule.actions.every((action) => action.type === ActionType.DELETE),
  );
  if (existing) return existing.id;

  const nameTaken = await prisma.rule.findUnique({
    where: { name_emailAccountId: { name: DELETE_RULE_NAME, emailAccountId } },
    select: { id: true },
  });
  if (nameTaken) {
    throw new SafeError(
      `A rule named "${DELETE_RULE_NAME}" exists but does not delete. Rename it or give it a Delete action.`,
    );
  }

  const rule = await createRuleWithResolvedActions({
    emailAccountId,
    data: { name: DELETE_RULE_NAME, enabled: true, runOnThreads: false },
    actions: [{ type: ActionType.DELETE }],
  });

  logger.info("Created delete rule for trained senders", { ruleId: rule.id });

  return rule.id;
}
