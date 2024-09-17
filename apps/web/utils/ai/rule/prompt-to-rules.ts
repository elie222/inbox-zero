import { z } from "zod";
import { chatCompletionTools } from "@/utils/llms";
import { UserAIFields } from "@/utils/llms/types";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";

const parameters = z.object({
  rules: z
    .array(createRuleSchema)
    .describe("The parsed rules list from the prompt file"),
});

export async function aiPromptToRules({
  user,
  promptFile,
}: {
  user: UserAIFields & { email: string };
  promptFile: string;
}) {
  const system =
    "You are an AI assistant that converts email management rules into a structured format. Parse the given prompt file and conver them into rules.";
  const prompt = `Convert the following prompt file into rules: ${promptFile}`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      parse_rules: {
        description: "Parse rules from prompt file",
        parameters,
      },
    },
    userEmail: user.email,
    label: "Prompt to rules",
  });

  const parsedRules = aiResponse.toolCalls[0].args as z.infer<
    typeof parameters
  >;
  return parsedRules;
}
