import { ActionItem } from "@/utils/ai/actions";
import {
  getArgsAiResponse,
  getActionItemsFromAiArgsResponse,
} from "@/utils/ai/choose-rule/ai-choose-args";
import { getAiResponse } from "@/utils/ai/choose-rule/ai-choose-rule";
import { REQUIRES_MORE_INFO } from "@/utils/ai/choose-rule/consts";
import { UserAIFields } from "@/utils/llms/types";
import { RuleWithActions } from "@/utils/types";
import { Rule, User } from "@prisma/client";
import { getFunctionsFromRules } from "@/utils/ai/choose-rule/functions-from-rules";
import { EmailForLLM } from "@/utils/ai/choose-rule/stringify-email";

export type ChooseRuleOptions = {
  email: EmailForLLM;
  rules: RuleWithActions[];
  user: Pick<User, "email" | "about"> & UserAIFields;
};
export async function chooseRule(options: ChooseRuleOptions): Promise<
  | {
      rule: Rule;
      actionItems: ActionItem[];
      reason?: string;
    }
  | { rule?: undefined; actionItems?: undefined; reason?: string }
> {
  const { email, rules, user } = options;
  const rulesWithFunctions = getFunctionsFromRules({ rules });

  const aiResponse = await getAiResponse({
    email,
    functions: rulesWithFunctions.map((r) => r.function),
    user,
  });

  const ruleNumber = aiResponse ? aiResponse.rule - 1 : undefined;
  if (typeof ruleNumber !== "number") {
    console.warn("No rule selected");
    return { reason: aiResponse?.reason };
  }

  const selectedRule = rulesWithFunctions[ruleNumber];

  if (selectedRule.function.name === REQUIRES_MORE_INFO)
    return { reason: aiResponse?.reason };

  const aiArgsResponse = selectedRule.shouldAiGenerateArgs
    ? await getArgsAiResponse({
        ...options,
        email,
        selectedRule: selectedRule.function,
        argsFunction: selectedRule.functionForArgs,
      })
    : undefined;

  const actionItems = getActionItemsFromAiArgsResponse(
    aiArgsResponse,
    selectedRule.rule.actions,
  );

  return {
    rule: selectedRule.rule,
    actionItems,
    reason: aiResponse?.reason,
  };
}
