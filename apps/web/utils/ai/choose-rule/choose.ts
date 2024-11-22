import type { ActionItem } from "@/utils/ai/actions";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/ai-choose-args";
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

  if (!rules.length) return { reason: "No rules" };

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

  const actionItems = await getActionItemsWithAiArgs({
    email,
    user,
    selectedRule,
  });

  return {
    rule: selectedRule,
    actionItems,
    reason: aiResponse?.reason,
  };
}
