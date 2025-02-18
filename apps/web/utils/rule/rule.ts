import type { CreateOrUpdateRuleSchemaWithCategories } from "@/utils/ai/rule/create-rule-schema";
import prisma, { isDuplicateError } from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { Prisma, Rule } from "@prisma/client";
import { getUserCategoriesForNames } from "@/utils/category.server";
import { getActionRiskLevel, type RiskAction } from "@/utils/risk";
import { hasExampleParams } from "@/app/(app)/automation/examples";

const logger = createScopedLogger("rule");

export function partialUpdateRule({
  ruleId,
  data,
}: {
  ruleId: string;
  data: Partial<Rule>;
}) {
  return prisma.rule.update({
    where: { id: ruleId },
    data,
    include: { actions: true, categoryFilters: true, group: true },
  });
}

export async function safeCreateRule(
  result: CreateOrUpdateRuleSchemaWithCategories,
  userId: string,
  categoryNames?: string[] | null,
) {
  const categoryIds = await getUserCategoriesForNames(
    userId,
    categoryNames || [],
  );

  try {
    const rule = await createRule({
      result,
      userId,
      categoryIds,
    });
    return rule;
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule({
        result: { ...result, name: `${result.name} - ${Date.now()}` },
        userId,
        categoryIds,
      });
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
  categoryIds?: string[] | null,
) {
  try {
    const rule = await updateRule(ruleId, result, userId, categoryIds);
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule({
        result: { ...result, name: `${result.name} - ${Date.now()}` },
        userId,
        categoryIds,
      });
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

async function createRule({
  result,
  userId,
  categoryIds,
}: {
  result: CreateOrUpdateRuleSchemaWithCategories;
  userId: string;
  categoryIds?: string[] | null;
}) {
  const mappedActions = mapActionFields(result.actions);

  return prisma.rule.create({
    data: {
      name: result.name,
      userId,
      actions: { createMany: { data: mappedActions } },
      automate: shouldAutomate(
        result,
        mappedActions.map((a) => ({
          type: a.type,
          subject: a.subject ?? null,
          content: a.content ?? null,
          to: a.to ?? null,
          cc: a.cc ?? null,
          bcc: a.bcc ?? null,
        })),
      ),
      runOnThreads: true,
      conditionalOperator: result.condition.conditionalOperator,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
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
      conditionalOperator: result.condition.conditionalOperator,
      instructions: result.condition.aiInstructions,
      from: result.condition.static?.from,
      to: result.condition.static?.to,
      subject: result.condition.static?.subject,
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

export async function deleteRule({
  userId,
  ruleId,
  groupId,
}: {
  ruleId: string;
  userId: string;
  groupId?: string | null;
}) {
  return Promise.all([
    prisma.rule.delete({ where: { id: ruleId, userId } }),
    // in the future, we can make this a cascade delete, but we need to change the schema for this to happen
    groupId ? prisma.group.delete({ where: { id: groupId, userId } }) : null,
  ]);
}

function shouldAutomate(
  rule: CreateOrUpdateRuleSchemaWithCategories,
  actions: RiskAction[],
) {
  // Don't automate if it's an example rule that should have been edited by the user
  if (hasExampleParams(rule)) return false;

  const riskLevels = actions.map(
    (action) => getActionRiskLevel(action, false, {}).level,
  );
  // Only automate if all actions are low risk
  // User can manually enable in other cases
  return riskLevels.every((level) => level === "low");
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
