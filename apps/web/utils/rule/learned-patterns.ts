import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { GroupItemType, type GroupItemSource } from "@/generated/prisma/enums";
import { isDuplicateError } from "@/utils/prisma-helpers";

/**
 * Saves a learned pattern for a rule
 * - Creates a group for the rule if one doesn't exist
 * - Adds the from pattern to the group
 *
 * @param ruleId - The rule ID (preferred) OR ruleName to look up the rule
 */
export async function saveLearnedPattern({
  emailAccountId,
  from,
  ruleId,
  ruleName,
  exclude = false,
  logger,
  reason,
  threadId,
  messageId,
  source,
}: {
  emailAccountId: string;
  from: string;
  ruleId?: string;
  ruleName?: string;
  exclude?: boolean;
  logger: Logger;
  reason?: string | null;
  threadId?: string | null;
  messageId?: string | null;
  source?: GroupItemSource | null;
}) {
  const rule = ruleId
    ? await prisma.rule.findUnique({
        where: { id: ruleId },
        select: { id: true, name: true, groupId: true },
      })
    : ruleName
      ? await prisma.rule.findUnique({
          where: {
            name_emailAccountId: {
              name: ruleName,
              emailAccountId,
            },
          },
          select: { id: true, name: true, groupId: true },
        })
      : null;

  if (!rule) {
    logger.error("Rule not found", { emailAccountId, ruleId, ruleName });
    return;
  }

  let groupId = rule.groupId;

  if (!groupId) {
    // Create a new group for this rule if one doesn't exist
    const newGroup = await prisma.group.create({
      data: {
        emailAccountId,
        name: rule.name,
        rule: { connect: { id: rule.id } },
      },
    });

    groupId = newGroup.id;
  }

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

  let groupId = rule.groupId;

  if (!groupId) {
    try {
      const newGroup = await prisma.group.create({
        data: {
          emailAccountId,
          name: ruleName,
          rule: { connect: { id: rule.id } },
        },
      });

      groupId = newGroup.id;
    } catch (error) {
      if (isDuplicateError(error)) {
        logger.error("Group already exists", { emailAccountId, ruleName });
        const newGroup2 = await prisma.group.create({
          data: {
            emailAccountId,
            name: `${ruleName} (${new Date().toISOString()})`,
            rule: { connect: { id: rule.id } },
          },
        });
        groupId = newGroup2.id;
      } else {
        logger.error("Error creating learned patterns group", { error });
        return { error: "Error creating learned patterns group" };
      }
    }
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
