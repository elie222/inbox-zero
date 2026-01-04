import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { GroupItemType, type GroupItemSource } from "@/generated/prisma/enums";
import { isDuplicateError } from "@/utils/prisma-helpers";

/**
 * Saves a learned pattern for a rule
 * - Creates a group for the rule if one doesn't exist
 * - Adds the from pattern to the group
 */
export async function saveLearnedPattern({
  emailAccountId,
  from,
  ruleId,
  exclude = false,
  logger,
  reason,
  threadId,
  messageId,
  source,
}: {
  emailAccountId: string;
  from: string;
  ruleId: string;
  exclude?: boolean;
  logger: Logger;
  reason?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  source?: GroupItemSource | null;
}) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId, emailAccountId },
    select: { id: true, name: true, groupId: true },
  });

  if (!rule) {
    logger.error("Rule not found", { ruleId });
    return;
  }

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
        value: from,
      },
    },
    update: {
      exclude,
      reason,
      threadId,
      messageId,
      source,
    },
    create: {
      groupId,
      type: GroupItemType.FROM,
      value: from,
      exclude,
      reason,
      threadId,
      messageId,
      source,
    },
  });
}

/**
 * Saves multiple learned patterns for a rule
 * @param patterns An array of patterns to save
 */
export async function saveLearnedPatterns({
  emailAccountId,
  ruleName,
  patterns,
  logger,
}: {
  emailAccountId: string;
  ruleName: string;
  patterns: Array<{
    type: GroupItemType;
    value: string;
    exclude?: boolean;
  }>;
  logger: Logger;
}) {
  const rule = await prisma.rule.findUnique({
    where: {
      name_emailAccountId: {
        name: ruleName,
        emailAccountId,
      },
    },
    select: { id: true, groupId: true },
  });

  if (!rule) {
    logger.error("Rule not found", { emailAccountId, ruleName });
    return { error: "Rule not found" };
  }

  let groupId: string;
  try {
    groupId = await getOrCreateGroupForRule({
      emailAccountId,
      ruleId: rule.id,
      ruleName: ruleName,
      existingGroupId: rule.groupId,
      logger,
    });
  } catch (error) {
    logger.error("Error creating learned patterns group", { error });
    return { error: "Error creating learned patterns group" };
  }

  const errors: string[] = [];

  // Process all patterns in a single function
  for (const pattern of patterns) {
    try {
      await prisma.groupItem.upsert({
        where: {
          groupId_type_value: {
            groupId,
            type: pattern.type,
            value: pattern.value,
          },
        },
        update: {
          exclude: pattern.exclude || false,
        },
        create: {
          groupId,
          type: pattern.type,
          value: pattern.value,
          exclude: pattern.exclude || false,
        },
      });
    } catch (error) {
      const message = `${pattern.value} (${pattern.type}) ${
        pattern.exclude ? "excluded" : ""
      }`;

      if (isDuplicateError(error)) {
        errors.push(`Duplicate pattern: ${message}`);
      } else {
        errors.push(`Error saving pattern: ${message}`);
      }
    }
  }

  if (errors.length > 0) {
    return { error: errors.join(", ") };
  }

  return { success: true };
}

async function getOrCreateGroupForRule({
  emailAccountId,
  ruleId,
  ruleName,
  existingGroupId,
  logger,
}: {
  emailAccountId: string;
  ruleId: string;
  ruleName: string;
  existingGroupId: string | null;
  logger: Logger;
}): Promise<string> {
  if (existingGroupId) return existingGroupId;

  // Try to create the group
  try {
    const newGroup = await prisma.group.create({
      data: {
        emailAccountId,
        name: ruleName,
        rule: { connect: { id: ruleId } },
      },
    });
    return newGroup.id;
  } catch (error) {
    if (!isDuplicateError(error)) throw error;
  }

  // Handle duplicate: check if rule was concurrently updated with a group
  const updatedRule = await prisma.rule.findUnique({
    where: { id: ruleId },
    select: { groupId: true },
  });
  if (updatedRule?.groupId) return updatedRule.groupId;

  // Check if a group with the same name exists
  const existingGroup = await prisma.group.findUnique({
    where: { name_emailAccountId: { name: ruleName, emailAccountId } },
    select: { id: true },
  });

  if (existingGroup) {
    // Attempt to link it (ignore failures from concurrent updates)
    await prisma.rule
      .update({ where: { id: ruleId }, data: { groupId: existingGroup.id } })
      .catch((error) => {
        logger.warn(
          "Failed to link existing group to rule (likely concurrent update)",
          {
            ruleId,
            groupId: existingGroup.id,
            error,
          },
        );
      });
    return existingGroup.id;
  }

  throw new Error(`Failed to create or find group for rule: ${ruleName}`);
}
