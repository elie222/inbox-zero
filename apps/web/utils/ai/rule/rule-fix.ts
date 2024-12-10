import { z } from "zod";
import {
  type EmailForLLM,
  stringifyEmail,
} from "@/utils/ai/choose-rule/stringify-email";
import { chatCompletionObject } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import type { Rule, User } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("AI Rule Fix");

const ruleFixSchema = z.object({
  fixedInstructions: z.string(),
});

export type RuleFixResponse = z.infer<typeof ruleFixSchema>;

export async function aiRuleFix({
  user,
  rule,
  email,
  explanation,
}: {
  user: Pick<User, "email" | "about"> & UserAIFields;
  rule: Pick<Rule, "instructions">;
  email: EmailForLLM;
  explanation?: string;
}) {
  const system = `You are an AI assistant that helps fix and improve email rules.

<instructions>
1. Analyze the provided rule and email content
2. If the rule didn't match the email when it should have, fix the rule to make it match
3. If the rule matched the email when it shouldn't have, make the rule more specific
4. Return the fixed rule text only
5. Use the same format and syntax as the original rule
6. Make minimal changes to fix the issue while maintaining the original intent
</instructions>

${user.about ? `<user_info>${user.about}</user_info>` : ""}

Examples:

<example_response>
Apply this rule to emails reporting technical issues, bugs, or website problems, but DO NOT apply this to technical newsletters.
</example_response>

<example_response>
Match cold emails from recruiters about job opportunities, but exclude automated job alerts or marketing emails from job boards.
</example_response>`;

  const prompt = `Here is the rule that needs to be fixed:
<current_rule>
${rule.instructions}
</current_rule>

Here is the email it matched against but shouldn't have:
${stringifyEmail(email, 500)}

${
  explanation
    ? `What was wrong:
<explanation>${explanation}</explanation>`
    : ""
}

Please provide the fixed rule.`;

  logger.trace({ system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: user,
    prompt,
    system,
    schema: ruleFixSchema,
    userEmail: user.email ?? "",
    usageLabel: "ai-rule-fix",
  });

  logger.trace(aiResponse.object);

  return aiResponse.object;
}
