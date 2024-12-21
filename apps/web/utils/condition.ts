import {
  CategoryFilterType,
  LogicalOperator,
  RuleType,
  type Category,
  type Rule,
} from "@prisma/client";
import type { CreateRuleBody, ZodCondition } from "@/utils/actions/validation";

export type RuleConditions = Partial<
  Pick<
    Rule,
    | "groupId"
    | "instructions"
    | "from"
    | "to"
    | "subject"
    | "body"
    | "categoryFilterType"
    | "conditionalOperator"
  > & {
    group?: { name: string } | null;
    categoryFilters?: Pick<Category, "id" | "name">[];
  }
>;

export function isAIRule<T extends RuleConditions>(
  rule: T,
): rule is T & { instructions: string } {
  return !!rule.instructions;
}

export function isGroupRule<T extends RuleConditions>(
  rule: T,
): rule is T & { groupId: string } {
  return !!rule.groupId;
}

export function isStaticRule(rule: RuleConditions) {
  return !!rule.from || !!rule.to || !!rule.subject || !!rule.body;
}

export function isCategoryRule(rule: RuleConditions) {
  return !!(rule.categoryFilters?.length && rule.categoryFilterType);
}

export function getConditions(rule: RuleConditions) {
  const conditions: CreateRuleBody["conditions"] = [];

  if (isAIRule(rule)) {
    conditions.push({
      type: RuleType.AI,
      instructions: rule.instructions,
    });
  }

  if (isGroupRule(rule)) {
    conditions.push({
      type: RuleType.GROUP,
      groupId: rule.groupId,
    });
  }

  if (isStaticRule(rule)) {
    conditions.push({
      type: RuleType.STATIC,
      from: rule.from,
      to: rule.to,
      subject: rule.subject,
      body: rule.body,
    });
  }

  if (isCategoryRule(rule)) {
    conditions.push({
      type: RuleType.CATEGORY,
      categoryFilterType: rule.categoryFilterType,
      categoryFilters: rule.categoryFilters?.map((category) => category.id),
    });
  }

  return conditions;
}

export function getConditionTypes(
  rule: RuleConditions,
): Record<RuleType, boolean> {
  return getConditions(rule).reduce(
    (acc, condition) => {
      acc[condition.type] = true;
      return acc;
    },
    {} as Record<RuleType, boolean>,
  );
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
  type: RuleType,
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
      default:
        console.log(`Unhandled condition type: ${condition.type}`);
        // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
        const exhaustiveCheck: never = condition.type;
        return exhaustiveCheck;
    }
    return acc;
  }, {} as FlattenedConditions);
};

//========================================
// toString utils
//========================================

export function conditionTypesToString(rule: RuleConditions) {
  return getConditions(rule)
    .map((condition) => ruleTypeToString(condition.type))
    .join(", ");
}

export function ruleTypeToString(ruleType: RuleType): string {
  switch (ruleType) {
    case RuleType.AI:
      return "AI";
    case RuleType.STATIC:
      return "Static";
    case RuleType.GROUP:
      return "Group";
    case RuleType.CATEGORY:
      return "Category";
    default:
      // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
      const exhaustiveCheck: never = ruleType;
      return exhaustiveCheck;
  }
}

export function conditionsToString(rule: RuleConditions) {
  let result = "";

  const connector =
    rule.conditionalOperator === LogicalOperator.AND ? " AND " : " OR ";

  if (rule.groupId) {
    result += `Group: ${rule.group?.name || "MISSING"}`;
  }

  if (rule.from || rule.to || rule.subject || rule.body) {
    const from = rule.from ? `From: "${rule.from}"` : "";
    if (from && result) result += connector;
    result += from;

    const subject = rule.subject ? `Subject: "${rule.subject}"` : "";
    if (subject && result) result += connector;
    result += subject;
  }

  if (rule.instructions) {
    if (result) result += connector;
    result += `AI: ${rule.instructions}`;
  }

  const categoryFilters = rule.categoryFilters;
  if (rule.categoryFilterType && categoryFilters?.length) {
    if (result) result += connector;
    const max = 3;
    const categories =
      categoryFilters
        .slice(0, max)
        .map((category) => category.name)
        .join(", ") + (categoryFilters.length > max ? ", ..." : "");
    result += `${categoryFilterTypeToString(rule.categoryFilterType)} ${categoryFilters.length === 1 ? "category" : "categories"}: ${categories}`;
  }

  return result;
}

export function categoryFilterTypeToString(
  categoryFilterType: CategoryFilterType,
): string {
  switch (categoryFilterType) {
    case CategoryFilterType.INCLUDE:
      return "Include";
    case CategoryFilterType.EXCLUDE:
      return "Exclude";
    default:
      // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
      const exhaustiveCheck: never = categoryFilterType;
      return exhaustiveCheck;
  }
}
