import {
  ActionType,
  GroupItemSource,
  GroupItemType,
} from "@/generated/prisma/enums";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getOrCreateGroupForRule } from "@/utils/rule/learned-patterns";
import { createRuleWithResolvedActions } from "@/utils/rule/rule";

const DELETE_RULE_NAME = "Delete";

/**
 * Files a sender under one rule: the pattern is added to that rule's group
 * as an inclusion and removed from every other rule it was trained into.
 * Exclusions are left alone.
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
    select: { id: true, name: true, groupId: true },
  });
  if (!rule) throw new SafeError("Rule not found");

  const groupId = await getOrCreateGroupForRule({
    emailAccountId,
    ruleId: rule.id,
    ruleName: rule.name,
    existingGroupId: rule.groupId,
    logger,
  });

  const pattern = {
    exclude: false,
    reason: "Moved by user",
    source: GroupItemSource.USER,
  };

  await prisma.$transaction([
    prisma.groupItem.upsert({
      where: {
        groupId_type_value: {
          groupId,
          type: GroupItemType.FROM,
          value: sender,
        },
      },
      update: pattern,
      create: { groupId, type: GroupItemType.FROM, value: sender, ...pattern },
    }),
    prisma.groupItem.deleteMany({
      where: {
        type: GroupItemType.FROM,
        value: sender,
        exclude: false,
        groupId: { not: groupId },
        group: { emailAccountId },
      },
    }),
  ]);

  logger.info("Moved trained sender to rule", { ruleId });
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
 * Keeps a sender in the inbox: dropped from any rule it was trained into and
 * excluded from every enabled rule, so nothing files or archives it.
 */
export async function keepSenderInInbox({
  emailAccountId,
  sender,
  logger,
}: {
  emailAccountId: string;
  sender: string;
  logger: Logger;
}) {
  await prisma.groupItem.deleteMany({
    where: {
      type: GroupItemType.FROM,
      value: sender,
      exclude: false,
      group: { emailAccountId },
    },
  });

  const rules = await prisma.rule.findMany({
    where: { emailAccountId, enabled: true },
    select: { id: true, name: true, groupId: true },
  });

  const pattern = {
    exclude: true,
    reason: "Keep in inbox",
    source: GroupItemSource.USER,
  };

  for (const rule of rules) {
    const groupId = await getOrCreateGroupForRule({
      emailAccountId,
      ruleId: rule.id,
      ruleName: rule.name,
      existingGroupId: rule.groupId,
      logger,
    });
    await prisma.groupItem.upsert({
      where: {
        groupId_type_value: {
          groupId,
          type: GroupItemType.FROM,
          value: sender,
        },
      },
      update: pattern,
      create: { groupId, type: GroupItemType.FROM, value: sender, ...pattern },
    });
  }

  logger.info("Keeping sender in inbox", { rules: rules.length });
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

export async function findOrCreateDeleteRule({
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
