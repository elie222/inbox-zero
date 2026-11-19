import type { Rule } from "@/generated/prisma/client";
import { ConditionType, type CoreConditionType } from "@/utils/config";
import type {
  CreateRuleBody,
  ZodCondition,
} from "@/utils/actions/rule.validation";
import type { Logger } from "@/utils/logger";

export type RuleConditions = Partial<
  Pick<
    Rule,
    | "groupId"
    | "instructions"
    | "from"
    | "to"
    | "subject"
    | "body"
    | "conditionalOperator"
  > & {
    group?: { name: string } | null;
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

export function getConditions(rule: RuleConditions) {
  const conditions: CreateRuleBody["conditions"] = [];

  if (isAIRule(rule)) {
    conditions.push({
      type: ConditionType.AI,
      instructions: rule.instructions,
      from: null,
      to: null,
      subject: null,
      body: null,
    });
  }

  if (isStaticRule(rule)) {
    // Split static conditions into separate conditions for each populated field
    // This matches the new UI where each condition has only one field
    if (rule.from) {
      conditions.push({
        type: ConditionType.STATIC,
        from: rule.from,
        to: null,
        subject: null,
        body: null,
        instructions: null,
      });
    }
    if (rule.to) {
      conditions.push({
        type: ConditionType.STATIC,
        from: null,
        to: rule.to,
        subject: null,
        body: null,
        instructions: null,
      });
    }
    if (rule.subject) {
      conditions.push({
        type: ConditionType.STATIC,
        from: null,
        to: null,
        subject: rule.subject,
        body: null,
        instructions: null,
      });
    }
    if (rule.body) {
      conditions.push({
        type: ConditionType.STATIC,
        from: null,
        to: null,
        subject: null,
        body: rule.body,
        instructions: null,
      });
    }
  }

  return conditions;
}

export function getConditionTypes(
  rule: RuleConditions,
): Record<CoreConditionType, boolean> {
  return getConditions(rule).reduce(
    (acc, condition) => {
      acc[condition.type] = true;
      return acc;
    },
    {} as Record<CoreConditionType, boolean>,
  );
}

export function getEmptyCondition(type: CoreConditionType): ZodCondition {
  switch (type) {
    case ConditionType.AI:
      return {
        type: ConditionType.AI,
        instructions: "",
      };
    case ConditionType.STATIC:
      // Default to "from" field for new STATIC conditions
      return {
        type: ConditionType.STATIC,
        from: null,
        to: null,
        subject: null,
        body: null,
        instructions: null,
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
};

export const flattenConditions = (
  conditions: ZodCondition[],
  logger: Logger,
): FlattenedConditions => {
  return conditions.reduce((acc, condition) => {
    switch (condition.type) {
      case ConditionType.AI:
        acc.instructions = condition.instructions;
        break;
      case ConditionType.STATIC:
        if (condition.to) acc.to = condition.to;
        if (condition.from) acc.from = condition.from;
        if (condition.subject) acc.subject = condition.subject;
        if (condition.body) acc.body = condition.body;
        break;
      default:
        logger.warn("Unknown condition type", { condition });
        // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
        const exhaustiveCheck: never = condition.type;
        return exhaustiveCheck;
    }
    return acc;
  }, {} as FlattenedConditions);
};
