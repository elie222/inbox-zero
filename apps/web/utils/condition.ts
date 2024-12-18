import { CategoryFilterType } from "@prisma/client";

import { type Category, type Rule, RuleType } from "@prisma/client";
import type { CreateRuleBody, ZodCondition } from "@/utils/actions/validation";

export function getConditions(
  rule: Partial<
    Pick<
      Rule,
      | "type"
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

  if (rule.type === RuleType.AI && rule.instructions) {
    conditions.push({
      type: RuleType.AI,
      instructions: rule.instructions,
    });
  }

  if (rule.type === RuleType.GROUP && rule.groupId) {
    conditions.push({
      type: RuleType.GROUP,
      groupId: rule.groupId,
    });
  }

  if (rule.type === RuleType.STATIC) {
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

export function getEmptyConditions(): ZodCondition[] {
  return [
    {
      type: RuleType.AI,
      instructions: "",
    },
    {
      type: RuleType.GROUP,
      groupId: "",
    },
    {
      type: RuleType.STATIC,
      from: null,
      to: null,
      subject: null,
      body: null,
    },
    {
      type: RuleType.CATEGORY,
      categoryFilterType: CategoryFilterType.INCLUDE,
      categoryFilters: [],
    },
  ];
}
