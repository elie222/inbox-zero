import { z } from "zod";
import type { Rule } from "@prisma/client";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("check-reply-tracking");

const schema = z.object({
  replyTrackingRuleId: z.string().nullable(),
});

export async function aiFindReplyTrackingRule({
  rules,
  user,
}: {
  rules: Pick<Rule, "id" | "instructions">[];
  user: UserEmailWithAI;
}) {
  const system = `You are an AI assistant that finds a rule that is designed to track email replies.
If no such rule is found, return null.`;

  const prompt = `<rules>
${rules
  .map(
    (rule) =>
      `<rule>
  <id>${rule.id}</id>
  <instructions>${rule.instructions}</instructions>
</rule>`,
  )
  .join("\n")}
</rules>`;

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema,
    userEmail: user.email || "",
    usageLabel: "Check reply tracking",
  });

  logger.trace("Result", { response: aiResponse.object });

  return aiResponse.object;
}
