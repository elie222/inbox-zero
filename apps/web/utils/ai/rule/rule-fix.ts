import { z } from "zod";
import { stringifyEmail } from "@/utils/stringify-email";
import type { EmailForLLM } from "@/utils/types";
import { chatCompletionObject } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import type { Rule, User } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("AI Rule Fix");

export type RuleFixResponse = {
  ruleToFix: "actual_rule" | "expected_rule";
  fixedInstructions: string;
};

export async function aiRuleFix({
  user,
  actualRule,
  expectedRule,
  email,
  explanation,
}: {
  user: Pick<User, "email" | "about"> & UserAIFields;
  actualRule: Pick<Rule, "instructions"> | null;
  expectedRule: Pick<Rule, "instructions"> | null;
  email: EmailForLLM;
  explanation?: string;
}): Promise<RuleFixResponse> {
  const { problem, schema, examples } = getRuleFixPromptConfig(
    actualRule,
    expectedRule,
  );

  const system = `You are an AI assistant that helps fix and improve email rules.

<instructions>
1. Analyze the provided rule and email content
2. Fix the rule so it matches the email
3. Use the same format and syntax as the original rule
4. Make minimal changes to fix the issue while maintaining the original intent
</instructions>

${user.about ? `<user_info>${user.about}</user_info>` : ""}

Example Outputs:

${examples.map((e) => `<example_output>${e}</example_output>`).join("\n")}
`;

  const prompt = `Here is the email that was tested:
<email>
${stringifyEmail(email, 500)}
</email>

${problem}

${
  explanation
    ? `User provided explanation:
<explanation>${explanation}</explanation>`
    : ""
}

Please provide the fixed rule.`;

  logger.trace("ai-rule-fix", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: user,
    prompt,
    system,
    schema,
    userEmail: user.email ?? "",
    usageLabel: "ai-rule-fix",
  });

  const res = aiResponse.object as {
    rule?: "actual_rule" | "expected_rule";
    fixedInstructions: string;
  };

  logger.trace("ai-rule-fix", { res });

  return {
    ruleToFix:
      res.rule ?? (actualRule === null ? "expected_rule" : "actual_rule"),
    fixedInstructions: res.fixedInstructions,
  };
}

// But messy. May refactor this in the future into 3 functions above
function getRuleFixPromptConfig(
  actualRule: Pick<Rule, "instructions"> | null,
  expectedRule: Pick<Rule, "instructions"> | null,
): {
  problem: string;
  schema: z.ZodSchema;
  examples: string[];
} {
  if (actualRule && expectedRule) {
    return {
      problem: `Here is the rule it matched against:
<actual_rule>
${actualRule.instructions}
</actual_rule>

Here is the rule it was expected to match:
<expected_rule>
${expectedRule.instructions}
</expected_rule>

Based on the email content, determine which rule needs fixing and provide its improved version. The fixed rule should correctly handle the email while maintaining the original rule's intent.`,
      schema: z.object({
        ruleToFix: z.enum(["actual_rule", "expected_rule"]),
        fixedInstructions: z.string().describe("The updated instructions"),
      }),
      examples: [
        `{
  "ruleToFix": "actual_rule",
  "fixedInstructions": "Apply this rule to emails reporting technical issues, bugs, or website problems, but DO NOT apply this to technical newsletters."
}`,
        `{
  "ruleToFix": "expected_rule",
  "fixedInstructions": "Match cold emails from recruiters about job opportunities, but exclude automated job alerts or marketing emails from job boards."
}`,
      ],
    };
  }

  if (actualRule) {
    return {
      problem: `Here is the rule it matched against that it shouldn't have matched:
<rule>
${actualRule.instructions}
</rule>`,
      schema: z.object({
        fixedInstructions: z.string().describe("The updated instructions"),
      }),
      examples: [
        `{
  "fixedInstructions": "Apply this rule to emails reporting technical issues, bugs, or website problems, but DO NOT apply this to technical newsletters."
}`,
      ],
    };
  }

  if (expectedRule) {
    return {
      problem: `Here is the rule it should have matched:
<expected_rule>
${expectedRule.instructions}
</expected_rule>`,
      schema: z.object({
        fixedInstructions: z.string().describe("The updated instructions"),
      }),
      examples: [
        `{
  "fixedInstructions": "Apply this rule to emails reporting technical issues, bugs, or website problems, but DO NOT apply this to technical newsletters."
}`,
      ],
    };
  }

  throw new Error("No rule to fix");
}
