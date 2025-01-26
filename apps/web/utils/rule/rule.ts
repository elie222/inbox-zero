import type { CreateOrUpdateRuleSchemaWithCategories } from "@/utils/ai/rule/create-rule-schema";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  type Action,
  ActionType,
  type Prisma,
  type Rule,
} from "@prisma/client";
import { getUserCategoriesForNames } from "@/utils/category.server";

const logger = createScopedLogger("rule");

export function partialUpdateRule(ruleId: string, data: Partial<Rule>) {
  return prisma.rule.update({
    where: { id: ruleId },
    data,
    include: { actions: true, categoryFilters: true, group: true },
  });
}

export async function safeCreateRule(
  result: CreateOrUpdateRuleSchemaWithCategories,
  userId: string,
  groupId?: string | null,
  categoryNames?: string[] | null,
) {
  const categoryIds = await getUserCategoriesForNames(
    userId,
    categoryNames || [],
  );

  try {
    const rule = await createRule(result, userId, groupId, categoryNames);
    return rule;
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule(
        { ...result, name: `${result.name} - ${Date.now()}` },
        userId,
        groupId,
        categoryIds,
      );
      return rule;
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
  groupId?: string | null,
  categoryIds?: string[] | null,
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
  groupId?: string | null,
  categoryIds?: string[] | null,
) {
  return prisma.rule.create({
    data: {
      name: result.name,
      userId,
      actions: {
        createMany: {
          data: mapActionFields(result.actions),
        },
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
            connect: categoryIds.map((id) => ({
              id,
            })),
          }
        : undefined,
    },
    include: { actions: true, categoryFilters: true, group: true },
  });
}

async function updateRule(
  ruleId: string,
  result: CreateOrUpdateRuleSchemaWithCategories,
  userId: string,
  groupId?: string | null,
  categoryIds?: string[] | null,
) {
  return prisma.rule.update({
    where: { id: ruleId },
    data: {
      name: result.name,
      userId,
      // NOTE: this is safe for now as `Action` doesn't have relations
      // but if we add relations to `Action`, we would need to `update` here instead of `deleteMany` and `createMany` to avoid cascading deletes
      actions: {
        deleteMany: {},
        createMany: { data: mapActionFields(result.actions) },
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

export async function addRuleCategories(ruleId: string, categoryIds: string[]) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { categoryFilters: true },
  });

  if (!rule) throw new Error("Rule not found");

  const existingIds = rule.categoryFilters.map((c) => c.id) || [];
  const newIds = [...new Set([...existingIds, ...categoryIds])];

  return prisma.rule.update({
    where: { id: ruleId },
    data: { categoryFilters: { set: newIds.map((id) => ({ id })) } },
    include: { actions: true, categoryFilters: true, group: true },
  });
}

export async function removeRuleCategories(
  ruleId: string,
  categoryIds: string[],
) {
  const rule = await prisma.rule.findUnique({
    where: { id: ruleId },
    include: { categoryFilters: true },
  });

  if (!rule) throw new Error("Rule not found");

  const existingIds = rule.categoryFilters.map((c) => c.id) || [];
  const newIds = existingIds.filter((id) => !categoryIds.includes(id));

  return prisma.rule.update({
    where: { id: ruleId },
    data: { categoryFilters: { set: newIds.map((id) => ({ id })) } },
    include: { actions: true, categoryFilters: true, group: true },
  });
}

function mapActionFields(
  actions: CreateOrUpdateRuleSchemaWithCategories["actions"],
) {
  return actions.map(
    (a): Prisma.ActionCreateManyRuleInput => ({
      type: a.type,
      label: a.fields?.label,
      to: a.fields?.to,
      cc: a.fields?.cc,
      bcc: a.fields?.bcc,
      subject: a.fields?.subject,
      content: a.fields?.content,
      url: a.fields?.webhookUrl,
    }),
  );
}
