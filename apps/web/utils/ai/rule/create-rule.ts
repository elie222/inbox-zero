import { z } from "zod";
import zodToJsonSchema from "zod-to-json-schema";
import { parseJSON } from "@/utils/json";
import { saveAiUsage } from "@/utils/usage";
import { ActionType } from "@prisma/client";
import { UserAIFields } from "@/utils/llms/types";
import { chatCompletionTools, getAiProviderAndModel } from "@/utils/llms";

const createRuleSchema = z.object({
  name: z.string().describe("The name of the rule"),
  // `requiresAI` helps prevent the subject line being set too narrowly
  requiresAI: z
    .enum(["yes", "no"])
    .describe(
      "Yes, if an AI is required to process each email. No, if we can create static conditions to process the emails.",
    ),
  actions: z
    .array(
      z.object({
        type: z.nativeEnum(ActionType).describe("The type of the action"),
        label: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The label to apply to the email"),
        to: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The to email address to send the email to"),
        cc: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The cc email address to send the email to"),
        bcc: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The bcc email address to send the email to"),
        subject: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The subject of the email"),
        content: z
          .string()
          .nullish()
          .transform((v) => v ?? null)
          .describe("The content of the email"),
      }),
    )
    .describe("The actions to take"),
  staticConditions: z
    .object({
      from: z.string().optional().describe("The from email address to match"),
      to: z.string().optional().describe("The to email address to match"),
      subject: z
        .string()
        .optional()
        .describe(
          "The subject to match. Leave blank if AI is required to process the subject line.",
        ),
    })
    .optional()
    .describe("The static conditions to match"),
  group: z
    .enum(["Receipts", "Newsletters"])
    .optional()
    .describe("The group to match"),
});

export async function aiCreateRule(
  instructions: string,
  user: UserAIFields,
  userEmail: string,
) {
  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  const messages = [
    {
      role: "system" as const,
      content: `You are an AI assistant that helps people manage their emails.`,
    },
    {
      role: "user" as const,
      content: `Generate a rule for these instructions:\n${instructions}`,
    },
  ];

  const aiResponse = await chatCompletionTools(
    provider,
    model,
    user.openAIApiKey,
    messages,
    [
      {
        type: "function",
        function: {
          name: "categorizeRule",
          description: "Generate a rule to handle the email",
          parameters: zodToJsonSchema(createRuleSchema),
        },
      },
    ],
  );

  if (aiResponse.usage) {
    await saveAiUsage({
      email: userEmail,
      usage: aiResponse.usage,
      provider,
      model,
      label: "Categorize rule",
    });
  }

  const contentString = aiResponse.functionCall?.arguments;

  if (!contentString) return;

  try {
    const rule = createRuleSchema.parse(parseJSON(contentString));
    return rule;
  } catch (error) {
    // TODO if there's an error ask the ai to fix it?
    console.error(`Invalid response: ${error} ${contentString}`);
    return;
  }
}
