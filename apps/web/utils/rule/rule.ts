import type { CreateOrUpdateRuleSchemaWithCategories } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { createScopedLogger } from "@/utils/logger";
import {
  ActionType,
  type SystemType,
  type Prisma,
  type Rule,
} from "@prisma/client";
import { getUserCategoriesForNames } from "@/utils/category.server";
import { getActionRiskLevel, type RiskAction } from "@/utils/risk";
import { hasExampleParams } from "@/app/(app)/[emailAccountId]/assistant/examples";
import { SafeError } from "@/utils/error";
import { createRuleHistory } from "@/utils/rule/rule-history";

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

export async function safeCreateRule({
  result,
  emailAccountId,
  categoryNames,
  systemType,
  triggerType = "ai_creation",
}: {
  result: CreateOrUpdateRuleSchemaWithCategories;
  emailAccountId: string;
  categoryNames?: string[] | null;
  systemType?: SystemType | null;
  triggerType?: "ai_creation" | "manual_creation" | "system_creation";
}) {
  const categoryIds = await getUserCategoriesForNames({
    emailAccountId,
    names: categoryNames || [],
  });

  try {
    const rule = await createRule({
      result,
      emailAccountId,
      categoryIds,
      systemType,
      triggerType,
    });
    return rule;
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule({
        result: { ...result, name: `${result.name} - ${Date.now()}` },
        emailAccountId,
        categoryIds,
        triggerType,
      });
      return rule;
    }

    logger.error("Error creating rule", {
      emailAccountId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });
    // return { error: "Error creating rule." };
  }
}

export async function safeUpdateRule({
  ruleId,
  result,
  emailAccountId,
  categoryIds,
  triggerType = "ai_update",
}: {
  ruleId: string;
  result: CreateOrUpdateRuleSchemaWithCategories;
  emailAccountId: string;
  categoryIds?: string[] | null;
  triggerType?: "ai_update" | "manual_update" | "system_update";
}) {
  try {
    const rule = await updateRule({
      ruleId,
      result,
      emailAccountId,
      categoryIds,
      triggerType,
    });
    return { id: rule.id };
  } catch (error) {
    if (isDuplicateError(error, "name")) {
      // if rule name already exists, create a new rule with a unique name
      const rule = await createRule({
        result: { ...result, name: `${result.name} - ${Date.now()}` },
        emailAccountId,
        categoryIds,
        triggerType: "ai_creation", // Default for safeUpdateRule fallback
      });
      return { id: rule.id };
    }

    logger.error("Error updating rule", {
      emailAccountId,
      error:
        error instanceof Error
          ? { message: error.message, stack: error.stack, name: error.name }
          : error,
    });

    return { error: "Error updating rule." };
  }
}

export async function createRule({
  result,
  emailAccountId,
  categoryIds,
  systemType,
  triggerType = "ai_creation",
}: {
  result: CreateOrUpdateRuleSchemaWithCategories;
  emailAccountId: string;
  categoryIds?: string[] | null;
  systemType?: SystemType | null;
  triggerType?: "ai_creation" | "manual_creation" | "system_creation";
}) {
  const mappedActions = mapActionFields(result.actions);

  const rule = await prisma.rule.create({
    data: {
      name: result.name,
      emailAccountId,
      systemType,
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
      conditionalOperator: result.condition.conditionalOperator ?? undefined,
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

  // Track rule creation in history
  await createRuleHistory({ rule, triggerType });

  return rule;
}

async function updateRule({
  ruleId,
  result,
  emailAccountId,
  categoryIds,
  triggerType = "ai_update",
}: {
  ruleId: string;
  result: CreateOrUpdateRuleSchemaWithCategories;
  emailAccountId: string;
  categoryIds?: string[] | null;
  triggerType?: "ai_update" | "manual_update" | "system_update";
}) {
  const rule = await prisma.rule.update({
    where: { id: ruleId },
    data: {
      name: result.name,
      emailAccountId,
      // NOTE: this is safe for now as `Action` doesn't have relations
      // but if we add relations to `Action`, we would need to `update` here instead of `deleteMany` and `createMany` to avoid cascading deletes
      actions: {
        deleteMany: {},
        createMany: { data: mapActionFields(result.actions) },
      },
      conditionalOperator: result.condition.conditionalOperator ?? undefined,
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
    include: { actions: true, categoryFilters: true, group: true },
  });

  // Track rule update in history
  await createRuleHistory({ rule, triggerType });

  return rule;
}

export async function updateRuleActions({
  ruleId,
  actions,
}: {
  ruleId: string;
  actions: CreateOrUpdateRuleSchemaWithCategories["actions"];
}) {
  return prisma.rule.update({
    where: { id: ruleId },
    data: {
      actions: {
        deleteMany: {},
        createMany: { data: mapActionFields(actions) },
      },
    },
  });
}

export async function deleteRule({
  emailAccountId,
  ruleId,
  groupId,
}: {
  emailAccountId: string;
  ruleId: string;
  groupId?: string | null;
}) {
  return Promise.all([
    prisma.rule.delete({ where: { id: ruleId, emailAccountId } }),
    // in the future, we can make this a cascade delete, but we need to change the schema for this to happen
    groupId
      ? prisma.group.delete({ where: { id: groupId, emailAccountId } })
      : null,
  ]);
}

// TODO: in cases that we don't automate we should really let the user know in the UI so that they can turn it on themselves
function shouldAutomate(
  rule: CreateOrUpdateRuleSchemaWithCategories,
  actions: RiskAction[],
) {
  // Don't automate if it's an example rule that should have been edited by the user
  if (
    hasExampleParams({
      condition: rule.condition,
      actions: rule.actions.map((a) => ({ content: a.fields?.content })),
    })
  )
    return false;

  // Don't automate sending or replying to emails
  if (
    rule.actions.find(
      (a) => a.type === ActionType.REPLY || a.type === ActionType.SEND_EMAIL,
    )
  )
    return false;

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

  if (!rule) throw new SafeError("Rule not found");

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

  if (!rule) throw new SafeError("Rule not found");

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
