import { LogicalOperator, SubjectMatchMode } from "@/generated/prisma/enums";
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
    | "subjectMatchMode"
    | "body"
    | "conditionalOperator"
    | "fromExclude"
    | "toExclude"
    | "subjectExclude"
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
        fromExclude: rule.fromExclude ?? false,
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
        toExclude: rule.toExclude ?? false,
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
        subjectMatchMode: rule.subjectMatchMode ?? null,
        subjectExclude: rule.subjectExclude ?? false,
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
  fromExclude?: boolean;
  to?: string | null;
  toExclude?: boolean;
  subject?: string | null;
  subjectMatchMode?: SubjectMatchMode | null;
  subjectExclude?: boolean;
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
        if (condition.to) {
          acc.to = condition.to;
          acc.toExclude = condition.toExclude ?? false;
        }
        if (condition.from) {
          acc.from = condition.from;
          acc.fromExclude = condition.fromExclude ?? false;
        }
        if (condition.subject) {
          acc.subject = condition.subject;
          acc.subjectExclude = condition.subjectExclude ?? false;
        }
        if (condition.subjectMatchMode)
          acc.subjectMatchMode = condition.subjectMatchMode;
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

//========================================
// toString utils
//========================================

export function conditionTypesToString(rule: RuleConditions) {
  return getConditions(rule)
    .map((condition) => conditionTypeToString(condition.type))
    .join(", ");
}

function conditionTypeToString(conditionType: ConditionType): string {
  switch (conditionType) {
    case ConditionType.AI:
      return "AI";
    case ConditionType.STATIC:
      return "Static";
    case ConditionType.LEARNED_PATTERN:
      return "Group";
    case ConditionType.PRESET:
      return "Preset";
    default:
      // biome-ignore lint/correctness/noSwitchDeclarations: intentional exhaustive check
      const exhaustiveCheck: never = conditionType;
      return exhaustiveCheck;
  }
}

export type StaticConditionField = "from" | "to" | "subject" | "body";

export type StaticConditionDescription = {
  field: StaticConditionField;
  /** Human-readable operator, e.g. "Not from" or "Subject starts with" */
  label: string;
  value: string;
  /** The one string every surface prints */
  text: string;
};

/**
 * Static conditions are always ANDed with each other. A rule's
 * conditionalOperator only separates the static block from the AI clause --
 * see getStaticConditionFailures, which requires every static field to match
 * regardless of the operator.
 */
export const STATIC_CONDITION_CONNECTOR = "AND";

type DescribableRule = Pick<
  RuleConditions,
  | "from"
  | "to"
  | "subject"
  | "body"
  | "fromExclude"
  | "toExclude"
  | "subjectExclude"
> & { subjectMatchMode?: SubjectMatchMode | null };

/**
 * The single description of a rule's static conditions.
 *
 * Every surface that renders conditions reads this: the rules list, the rule
 * editor, the "why didn't this match" hints, and the prompt the AI matcher
 * sees. They used to format independently and disagreed -- exclusions were
 * dropped in some places, and no surface showed the subject match mode at all,
 * so a STARTS_WITH rule looked identical to a CONTAINS one.
 *
 * Emitted in the order the matcher evaluates them so descriptions line up with
 * the failure reasons it produces.
 */
export function describeStaticConditions(
  rule: DescribableRule,
): StaticConditionDescription[] {
  const descriptions: StaticConditionDescription[] = [];

  if (rule.from) {
    descriptions.push(
      describe("from", rule.fromExclude ? "Not from" : "From", rule.from),
    );
  }

  if (rule.to) {
    descriptions.push(
      describe("to", rule.toExclude ? "Not to" : "To", rule.to),
    );
  }

  if (rule.subject) {
    descriptions.push(
      describe("subject", subjectLabel(rule), rule.subject, { quoted: true }),
    );
  }

  // No bodyExclude column exists, and body has no match mode.
  if (rule.body) {
    descriptions.push(
      describe("body", "Body contains", rule.body, {
        quoted: true,
      }),
    );
  }

  return descriptions;
}

export function staticConditionsToString(rule: DescribableRule) {
  return describeStaticConditions(rule)
    .map((condition) => condition.text)
    .join(` ${STATIC_CONDITION_CONNECTOR} `);
}

export function conditionsToString(rule: RuleConditions) {
  const staticConditions = describeStaticConditions(rule);
  const staticText = staticConditions
    .map((condition) => condition.text)
    .join(` ${STATIC_CONDITION_CONNECTOR} `);

  if (!rule.instructions) return staticText;
  if (!staticText) return rule.instructions;

  const operator =
    rule.conditionalOperator === LogicalOperator.OR ? "OR" : "AND";

  // Bracket the static group so the operator visibly binds to all of it. The
  // unbracketed form read "From: x, Subject: y OR <instructions>", which looks
  // like the OR applies to the subject alone.
  const staticClause =
    staticConditions.length > 1 ? `(${staticText})` : staticText;

  return `${staticClause} ${operator} ${rule.instructions}`;
}

function subjectLabel(rule: DescribableRule) {
  if (rule.subjectExclude) return "Subject doesn't contain";
  return rule.subjectMatchMode === SubjectMatchMode.STARTS_WITH
    ? "Subject starts with"
    : "Subject contains";
}

function describe(
  field: StaticConditionField,
  label: string,
  value: string,
  { quoted = false }: { quoted?: boolean } = {},
): StaticConditionDescription {
  return {
    field,
    label,
    value,
    text: `${label}: ${quoted ? `"${value}"` : value}`,
  };
}
