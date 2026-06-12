import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";

type RuleCondition = CreateOrUpdateRuleSchema["condition"];

export function toCreateOrUpdateRuleCondition({
  conditionalOperator,
  aiInstructions,
  static: staticInput,
}: {
  conditionalOperator: RuleCondition["conditionalOperator"];
  aiInstructions?: string | null;
  static?: {
    from?: string | null;
    to?: string | null;
    subject?: string | null;
  } | null;
}): RuleCondition {
  const staticCondition = {
    from: valueOrNull(staticInput?.from),
    to: valueOrNull(staticInput?.to),
    subject: valueOrNull(staticInput?.subject),
  };
  const normalizedAiInstructions = valueOrNull(aiInstructions);

  if (normalizedAiInstructions) {
    return {
      conditionalOperator,
      aiInstructions: normalizedAiInstructions,
      static: staticCondition,
    };
  }

  if (staticCondition.from) {
    return {
      conditionalOperator,
      aiInstructions: normalizedAiInstructions,
      static: { ...staticCondition, from: staticCondition.from },
    };
  }

  if (staticCondition.to) {
    return {
      conditionalOperator,
      aiInstructions: normalizedAiInstructions,
      static: { ...staticCondition, to: staticCondition.to },
    };
  }

  if (staticCondition.subject) {
    return {
      conditionalOperator,
      aiInstructions: normalizedAiInstructions,
      static: { ...staticCondition, subject: staticCondition.subject },
    };
  }

  throw new Error("A rule must include at least one condition");
}

function valueOrNull(value?: string | null) {
  return value?.trim() ? value : null;
}
