import { GroupItemSource, GroupItemType } from "@/generated/prisma/enums";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getOrCreateGroupForRule } from "@/utils/rule/learned-patterns";

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
