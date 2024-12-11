import { z } from "zod";
import {
  type EmailForLLM,
  stringifyEmail,
} from "@/utils/ai/choose-rule/stringify-email";
import { chatCompletionObject } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import type { Rule, User } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";
import stripIndent from "strip-indent";

const logger = createScopedLogger("AI Rule Fix");

export type RuleFixResponse = {
  rule: "matched_rule" | "correct_rule";
  fixedInstructions: string;
};

export async function aiRuleFix({
  user,
  incorrectRule,
  correctRule,
  email,
  explanation,
}: {
  user: Pick<User, "email" | "about"> & UserAIFields;
  incorrectRule: Pick<Rule, "instructions"> | null;
  correctRule: Pick<Rule, "instructions"> | null;
  email: EmailForLLM;
  explanation?: string;
}): Promise<RuleFixResponse> {
  const { problem, schema, examples } = getRuleFixPromptConfig(
    incorrectRule,
    correctRule,
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

  logger.trace({ system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: user,
    prompt,
    system,
    schema,
    userEmail: user.email ?? "",
    usageLabel: "ai-rule-fix",
  });

  const res = aiResponse.object as {
    rule?: "matched_rule" | "correct_rule";
    fixedInstructions: string;
  };

  logger.trace(res);

  return {
    rule:
      res.rule ?? (incorrectRule === null ? "correct_rule" : "matched_rule"),
    fixedInstructions: res.fixedInstructions,
  };
}

// But messy. May refactor this in the future into 3 functions above
function getRuleFixPromptConfig(
  incorrectRule: Pick<Rule, "instructions"> | null,
  correctRule: Pick<Rule, "instructions"> | null,
): {
  problem: string;
  schema: z.ZodSchema;
  examples: string[];
} {
  if (incorrectRule && correctRule) {
    return {
      problem: stripIndent(`Here is the rule it matched against:
                        <matched_rule>
                        ${incorrectRule.instructions}
                        </matched_rule>

                        Here is the rule it should have matched:
                        <correct_rule>
                        ${correctRule.instructions}
                        </correct_rule>`),
      schema: z.object({
        rule: z.enum(["matched_rule", "correct_rule"]),
        fixedInstructions: z.string().describe("The updated instructions"),
      }),
      examples: [
        stripIndent(`{
                      "rule": "matched_rule",
                      "fixedInstructions": "Apply this rule to emails reporting technical issues, bugs, or website problems, but DO NOT apply this to technical newsletters."
                    }`),
        stripIndent(`{
                      "rule": "correct_rule",
                      "fixedInstructions": "Match cold emails from recruiters about job opportunities, but exclude automated job alerts or marketing emails from job boards."
                    }`),
      ],
    };
  }

  if (incorrectRule) {
    return {
      problem:
        stripIndent(`Here is the rule it matched against that it shouldn't have matched:
                    <matched_rule>
                    ${incorrectRule.instructions}
                    </matched_rule>`),
      schema: z.object({
        fixedInstructions: z.string().describe("The updated instructions"),
      }),
      examples: [
        stripIndent(`{
          "fixedInstructions": "Apply this rule to emails reporting technical issues, bugs, or website problems, but DO NOT apply this to technical newsletters."
        }`),
      ],
    };
  }

  if (correctRule) {
    return {
      problem: stripIndent(`Here is the rule it should have matched:
                          <correct_rule>
                          ${correctRule.instructions}
                          </correct_rule>`),
      schema: z.object({
        fixedInstructions: z.string().describe("The updated instructions"),
      }),
      examples: [
        stripIndent(`{
          "fixedInstructions": "Apply this rule to emails reporting technical issues, bugs, or website problems, but DO NOT apply this to technical newsletters."
        }`),
      ],
    };
  }

  throw new Error("No rule to fix");
}
