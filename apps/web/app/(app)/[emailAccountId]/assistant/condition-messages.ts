import type { I18n } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { LogicalOperator } from "@/generated/prisma/enums";
import { ConditionType } from "@/utils/config";
import { getConditions, type RuleConditions } from "@/utils/condition";

export function conditionTypesToString(rule: RuleConditions, i18n: I18n) {
  return getConditions(rule)
    .map((condition) => conditionTypeToString(condition.type, i18n))
    .join(", ");
}

export function conditionsToString(rule: RuleConditions, i18n: I18n) {
  const conditions: string[] = [];
  const connector =
    rule.conditionalOperator === LogicalOperator.AND
      ? i18n._(msg`AND`)
      : i18n._(msg`OR`);

  // Static conditions - grouped with commas
  const staticConditions: string[] = [];
  if (rule.from) {
    const from = rule.from;
    staticConditions.push(i18n._(msg`From: ${from}`));
  }
  if (rule.subject) {
    const subject = rule.subject;
    staticConditions.push(i18n._(msg`Subject: "${subject}"`));
  }
  if (rule.to) {
    const to = rule.to;
    staticConditions.push(i18n._(msg`To: ${to}`));
  }
  if (rule.body) {
    const body = rule.body;
    staticConditions.push(i18n._(msg`Body: "${body}"`));
  }
  if (staticConditions.length) conditions.push(staticConditions.join(", "));

  // AI condition
  if (rule.instructions) conditions.push(rule.instructions);

  return conditions.join(` ${connector} `);
}

function conditionTypeToString(
  conditionType: ConditionType,
  i18n: I18n,
): string {
  switch (conditionType) {
    case ConditionType.AI:
      return i18n._(msg`AI`);
    case ConditionType.STATIC:
      return i18n._(msg`Static`);
    case ConditionType.LEARNED_PATTERN:
      return i18n._(msg`Group`);
    case ConditionType.PRESET:
      return i18n._(msg`Preset`);
    default: {
      const exhaustiveCheck: never = conditionType;
      return exhaustiveCheck;
    }
  }
}
