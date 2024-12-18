import type { CategoryFilterType } from "@prisma/client";

import { type Category, type Rule, RuleType } from "@prisma/client";
import type { CreateRuleBody, ZodCondition } from "@/utils/actions/validation";

export function getConditions(
  rule: Partial<
    Pick<
      Rule,
      | "groupId"
      | "instructions"
      | "from"
      | "to"
      | "subject"
      | "body"
      | "categoryFilterType"
    > & {
      categoryFilters?: Category[];
    }
  >,
) {
  const conditions: CreateRuleBody["conditions"] = [];

  if (rule.instructions) {
    conditions.push({
      type: RuleType.AI,
      instructions: rule.instructions,
    });
  }

  if (rule.groupId) {
    conditions.push({
      type: RuleType.GROUP,
      groupId: rule.groupId,
    });
  }

  if (rule.from || rule.to || rule.subject || rule.body) {
    conditions.push({
      type: RuleType.STATIC,
      from: rule.from,
      to: rule.to,
      subject: rule.subject,
      body: rule.body,
    });
  }

  if (rule.categoryFilterType) {
    conditions.push({
      type: RuleType.CATEGORY,
      categoryFilterType: rule.categoryFilterType,
      categoryFilters: rule.categoryFilters?.map((category) => category.id),
    });
  }

  return conditions;
}

const aiEmptyCondition = {
  type: RuleType.AI,
  instructions: "",
};

const groupEmptyCondition = {
  type: RuleType.GROUP,
  groupId: "",
};

const staticEmptyCondition = {
  type: RuleType.STATIC,
  from: null,
  to: null,
  subject: null,
  body: null,
};

const categoryEmptyCondition = {
  type: RuleType.CATEGORY,
  categoryFilterType: null,
  categoryFilters: null,
};

export function getEmptyConditions(): ZodCondition[] {
  return [
    aiEmptyCondition,
    groupEmptyCondition,
    staticEmptyCondition,
    categoryEmptyCondition,
  ];
}

export function getEmptyCondition(
  type: string,
  groupId?: string,
): ZodCondition {
  switch (type) {
    case RuleType.AI:
      return aiEmptyCondition;
    case RuleType.GROUP:
      return {
        ...groupEmptyCondition,
        groupId: groupId || "",
      };
    case RuleType.STATIC:
      return staticEmptyCondition;
    case RuleType.CATEGORY:
      return categoryEmptyCondition;
    default:
      throw new Error(`Invalid condition type: ${type}`);
  }
}

type FlattenedConditions = {
  instructions?: string | null;
  groupId?: string | null;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  body?: string | null;
  categoryFilterType?: CategoryFilterType | null;
  categoryFilters?: string[] | null;
};

export const flattenConditions = (
  conditions: ZodCondition[],
): FlattenedConditions => {
  return conditions.reduce((acc, condition) => {
    switch (condition.type) {
      case RuleType.AI:
        acc.instructions = condition.instructions;
        break;
      case RuleType.GROUP:
        acc.groupId = condition.groupId;
        break;
      case RuleType.STATIC:
        acc.to = condition.to;
        acc.from = condition.from;
        acc.subject = condition.subject;
        acc.body = condition.body;
        break;
      case RuleType.CATEGORY:
        acc.categoryFilterType = condition.categoryFilterType;
        acc.categoryFilters = condition.categoryFilters;
        break;
    }
    return acc;
  }, {} as FlattenedConditions);
};
