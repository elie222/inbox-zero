import type { CreateOrUpdateRuleSchema } from "@/utils/ai/rule/create-rule-schema";

type RuleCondition = Omit<CreateOrUpdateRuleSchema["condition"], "static"> & {
  static?: {
    from?: string | null;
    to?: string | null;
    subject?: string | null;
    body?: string | null;
  } | null;
};

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
    body?: string | null;
  } | null;
}): RuleCondition {
  const staticCondition = {
    from: valueOrNull(staticInput?.from),
    to: valueOrNull(staticInput?.to),
    subject: valueOrNull(staticInput?.subject),
    body: valueOrNull(staticInput?.body),
  };
  const normalizedAiInstructions = valueOrNull(aiInstructions);

  if (
    normalizedAiInstructions ||
    staticCondition.from ||
    staticCondition.to ||
    staticCondition.subject ||
    staticCondition.body
  ) {
    return {
      conditionalOperator,
      aiInstructions: normalizedAiInstructions,
      static: staticCondition,
    };
  }

  throw new Error("A rule must include at least one condition");
}

function valueOrNull(value?: string | null) {
  return value?.trim() ? value : null;
}
