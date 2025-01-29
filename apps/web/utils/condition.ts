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

export function getEmptyCondition(
  type: Exclude<RuleType, "GROUP">,
  category?: string,
): ZodCondition {
  switch (type) {
    case RuleType.AI:
      return {
        type: RuleType.AI,
        instructions: "",
      };
    case RuleType.STATIC:
      return {
        type: RuleType.STATIC,
        from: null,
        to: null,
        subject: null,
        body: null,
      };
    case RuleType.CATEGORY:
      return {
        type: RuleType.CATEGORY,
        categoryFilterType: CategoryFilterType.INCLUDE,
        categoryFilters: category ? [category] : null,
      };
    default:
      // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
      const exhaustiveCheck: never = type;
      return exhaustiveCheck;
  }
}

type FlattenedConditions = {
  instructions?: string | null;
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
  const conditions: string[] = [];
  const connector =
    rule.conditionalOperator === LogicalOperator.AND ? " AND " : " OR ";

  // Static conditions - grouped with commas
  const staticConditions: string[] = [];
  if (rule.from) staticConditions.push(`From: "${rule.from}"`);
  if (rule.subject) staticConditions.push(`Subject: "${rule.subject}"`);
  if (rule.to) staticConditions.push(`To: "${rule.to}"`);
  if (rule.body) staticConditions.push(`Body: "${rule.body}"`);
  if (staticConditions.length) conditions.push(staticConditions.join(", "));

  // AI condition
  if (rule.instructions) conditions.push(`AI: ${rule.instructions}`);

  // Category condition
  const categoryFilters = rule.categoryFilters;
  if (rule.categoryFilterType && categoryFilters?.length) {
    const max = 3;
    const categories =
      categoryFilters
        .slice(0, max)
        .map((category) => category.name)
        .join(", ") + (categoryFilters.length > max ? ", ..." : "");
    conditions.push(
      `${rule.categoryFilterType === CategoryFilterType.EXCLUDE ? "Exclude " : ""}${
        categoryFilters.length === 1 ? "Category" : "Categories"
      }: ${categories}`,
    );
  }

  // Group condition
  if (rule.groupId) {
    conditions.push("Group");
  }

  return conditions.join(connector);
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
