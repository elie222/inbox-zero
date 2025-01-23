import type { CreateOrUpdateRuleSchemaWithCategories } from "@/utils/ai/rule/create-rule-schema";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { type Action, ActionType } from "@prisma/client";

const logger = createScopedLogger("rule");

export async function safeCreateRule(
  result: CreateOrUpdateRuleSchemaWithCategories,
  userId: string,
  groupId: string | null,
  categoryIds: string[] | null,
) {
  try {
    const rule = await createRule(result, userId, groupId, categoryIds);
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule(
        { ...result, name: `${result.name} - ${Date.now()}` },
        userId,
        groupId,
        categoryIds,
      );
      return { id: rule.id };
    }

    logger.error("Error creating rule", {
      userId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    return { error: "Error creating rule." };
  }
}

export async function safeUpdateRule(
  ruleId: string,
  result: CreateOrUpdateRuleSchemaWithCategories,
  userId: string,
  groupId: string | null,
  categoryIds: string[] | null,
) {
  try {
    const rule = await updateRule(ruleId, result, userId, groupId, categoryIds);
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule(
        { ...result, name: `${result.name} - ${Date.now()}` },
        userId,
        groupId,
        categoryIds,
      );
      return { id: rule.id };
    }

    logger.error("Error updating rule", {
      userId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    return { error: "Error updating rule." };
  }
}

async function createRule(
  result: CreateOrUpdateRuleSchemaWithCategories,
  userId: string,
  groupId: string | null,
  categoryIds: string[] | null,
) {
  return prisma.rule.create({
    data: {
      name: result.name,
      userId,
      actions: { createMany: { data: result.actions } },
      automate: shouldAutomate(result.actions),
      runOnThreads: shouldRunOnThreads(result.condition),
      conditionalOperator: result.condition.conditionalOperator,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
      groupId,
      categoryFilterType: result.condition.categories?.categoryFilterType,
      categoryFilters: categoryIds
        ? {
            connect: categoryIds.map((id) => ({
              id,
            })),
          }
        : undefined,
    },
  });
}

async function updateRule(
  ruleId: string,
  result: CreateOrUpdateRuleSchemaWithCategories,
  userId: string,
  groupId: string | null,
  categoryIds: string[] | null,
) {
  return prisma.rule.update({
    where: { id: ruleId },
    data: {
      name: result.name,
      userId,
      actions: {
        deleteMany: {},
        createMany: { data: result.actions },
      },
      automate: shouldAutomate(result.actions),
      runOnThreads: shouldRunOnThreads(result.condition),
      conditionalOperator: result.condition.conditionalOperator,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
      groupId,
      categoryFilterType: result.condition.categories?.categoryFilterType,
      categoryFilters: categoryIds
        ? {
            set: categoryIds.map((id) => ({
              id,
            })),
          }
        : undefined,
    },
  });
}

function shouldAutomate(actions: Pick<Action, "type">[]) {
  const types = new Set(actions.map((action) => action.type));

  // don't automate replies, forwards, and send emails
  if (
    types.has(ActionType.REPLY) ||
    types.has(ActionType.FORWARD) ||
    types.has(ActionType.SEND_EMAIL)
  ) {
    return false;
  }

  return true;
}

// run on threads for static, group, and smart category rules
// user can enable to run on threads for ai rules themselves
function shouldRunOnThreads(condition?: { aiInstructions?: string }) {
  return !condition?.aiInstructions;
}
