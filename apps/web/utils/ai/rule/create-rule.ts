import { z } from "zod";
import { ActionType } from "@prisma/client";
import type { UserAIFields } from "@/utils/llms/types";
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

  const system = `You are an AI assistant that helps people manage their emails.`;
  const prompt = `Generate a rule for these instructions:\n${instructions}`;

  const aiResponse = await chatCompletionTools({
    provider,
    model,
    apiKey: user.openAIApiKey,
    prompt,
    system,
    tools: {
      categorize_rule: {
        description: "Generate a rule to handle the email",
        parameters: createRuleSchema,
      },
    },
    userEmail,
    label: "Categorize rule",
  });

  return aiResponse.toolCalls[0].args as z.infer<typeof createRuleSchema>;
}
