import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

const schema = z.object({ labels: z.array(z.string()).optional() });

export async function aiCleanSelectLabels({
  emailAccount,
  instructions,
}: {
  emailAccount: EmailAccountWithAI;
  instructions: string;
}) {
  const system = `You are an AI assistant helping users organize their emails efficiently.
Your task is to analyze the user's instructions and extract specific labels they want to use for email categorization.

Guidelines:
- Only extract labels explicitly mentioned in the instructions
- Labels should be single words or short phrases
- Do not create labels that weren't mentioned
- If no labels are specified, return an empty array

Return the labels as an array of strings in JSON format.`;

  const prompt = `<instructions>
${instructions}
</instructions>`.trim();

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Clean - Select Labels",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema,
  });

  return aiResponse.object.labels;
}
