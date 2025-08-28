import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { GroupItemType } from "@prisma/client";
import { isDuplicateError } from "@/utils/prisma-helpers";

const logger = createScopedLogger("rule/learned-patterns");

/**
 * Saves a learned pattern for a rule
 * - Creates a group for the rule if one doesn't exist
 * - Adds the from pattern to the group
 */
export async function saveLearnedPattern({
  emailAccountId,
  from,
  ruleName,
  reasoning,
}: {
  emailAccountId: string;
  from: string;
  ruleName: string;
  reasoning?: string;
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
    return;
  }

  let groupId = rule.groupId;

  if (!groupId) {
    // Create a new group for this rule if one doesn't exist
    const newGroup = await prisma.group.create({
      data: {
        emailAccountId,
        name: ruleName,
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
    update: {},
    create: {
      groupId,
      type: GroupItemType.FROM,
      value: from,
      reasoning,
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
}: {
  emailAccountId: string;
  ruleName: string;
  patterns: Array<{
    type: GroupItemType;
    value: string;
    exclude?: boolean;
    reasoning?: string;
  }>;
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
    // Store pattern with the exclude flag properly set in the database
    // This maps directly to the new exclude field in the GroupItem model
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
          reasoning: pattern.reasoning,
        },
        create: {
          groupId,
          type: pattern.type,
          value: pattern.value,
          exclude: pattern.exclude || false,
          reasoning: pattern.reasoning,
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

/**
 * Removes a learned pattern for a rule
 */
export async function removeLearnedPattern({
  emailAccountId,
  ruleName,
  pattern,
}: {
  emailAccountId: string;
  ruleName: string;
  pattern: {
    type: GroupItemType;
    value: string;
  };
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

  if (!rule || !rule.groupId) {
    logger.error("Rule or group not found", { emailAccountId, rule });
    return { error: "Rule or group not found" };
  }

  try {
    const deletedItem = await prisma.groupItem.delete({
      where: {
        groupId_type_value: {
          groupId: rule.groupId,
          type: pattern.type,
          value: pattern.value,
        },
      },
    });

    logger.info("Successfully removed learned pattern", {
      emailAccountId,
      ruleName,
      patternType: pattern.type,
      patternValue: pattern.value,
    });

    return { success: true, deletedItem };
  } catch (error) {
    logger.error("Error removing learned pattern", {
      error,
      emailAccountId,
      ruleName,
      patternType: pattern.type,
      patternValue: pattern.value,
    });
    return { error: "Failed to remove pattern" };
  }
}
