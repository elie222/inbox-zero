import { GroupItemSource } from "@/generated/prisma/enums";
import { SafeError } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { getOrCreateGroupForRule } from "@/utils/rule/learned-patterns";

/**
 * Re-files a trained sender under a different rule: the pattern is added to
 * the target rule's group (as an inclusion) and removed from the current one.
 */
export async function moveTrainedSender({
  emailAccountId,
  itemId,
  ruleId,
  logger,
}: {
  emailAccountId: string;
  itemId: string;
  ruleId: string;
  logger: Logger;
}) {
  const item = await prisma.groupItem.findFirst({
    where: { id: itemId, group: { emailAccountId } },
    select: {
      id: true,
      type: true,
      value: true,
      group: { select: { rule: { select: { id: true } } } },
    },
  });
  if (!item) throw new SafeError("Trained sender not found");
  if (item.group?.rule?.id === ruleId) return;

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
        groupId_type_value: { groupId, type: item.type, value: item.value },
      },
      update: pattern,
      create: { groupId, type: item.type, value: item.value, ...pattern },
    }),
    prisma.groupItem.delete({ where: { id: item.id } }),
  ]);

  logger.info("Moved trained sender to another rule", {
    itemId,
    ruleId,
  });
}
