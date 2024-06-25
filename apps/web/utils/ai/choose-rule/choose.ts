import type { ActionItem } from "@/utils/ai/actions";
import {
  getArgsAiResponse,
  getActionItemsFromAiArgsResponse,
  getActionsWithParameters,
} from "@/utils/ai/choose-rule/ai-choose-args";
import { getAiResponse } from "@/utils/ai/choose-rule/ai-choose-rule";
import type { UserAIFields } from "@/utils/llms/types";
import type { RuleWithActions } from "@/utils/types";
import type { Rule, User } from "@prisma/client";
import type { EmailForLLM } from "@/utils/ai/choose-rule/stringify-email";

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

  const aiResponse = await getAiResponse({
    email,
    rules,
    user,
  });

  const ruleNumber = aiResponse ? aiResponse.rule - 1 : undefined;
  if (typeof ruleNumber !== "number") {
    console.warn("No rule selected");
    return { reason: aiResponse?.reason };
  }

  const selectedRule = rules[ruleNumber];

  if (!selectedRule) return { reason: aiResponse?.reason };

  const shouldAiGenerateArgs =
    getActionsWithParameters(selectedRule.actions).length > 0;

  const aiArgsResponse = shouldAiGenerateArgs
    ? await getArgsAiResponse({
        ...options,
        email,
        selectedRule,
      })
    : undefined;

  const actionItems = getActionItemsFromAiArgsResponse(
    aiArgsResponse,
    selectedRule.actions,
  );

  return {
    rule: selectedRule,
    actionItems,
    reason: aiResponse?.reason,
  };
}
