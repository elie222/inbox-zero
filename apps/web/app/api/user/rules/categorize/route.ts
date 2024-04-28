import { z } from "zod";
import { NextResponse } from "next/server";
import zodToJsonSchema from "zod-to-json-schema";
import { parseJSON } from "@/utils/json";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { UserAIFields } from "@/utils/llms/types";
import { ActionType } from "@prisma/client";
import { withError } from "@/utils/middleware";
import { saveAiUsage } from "@/utils/usage";
import { chatCompletionTools, getAiProviderAndModel } from "@/utils/llms";
import { zodRuleType } from "@/app/api/user/rules/[id]/validation";

const categorizeRuleBody = z.object({ ruleId: z.string() });
export type CategorizeRuleBody = z.infer<typeof categorizeRuleBody>;
export type CategorizeRuleResponse = Awaited<ReturnType<typeof categorizeRule>>;

const categorizeRuleResponse = z.object({
  name: z.string().describe("The name of the rule"),
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
  ruleType: zodRuleType.describe("The type of the rule"),
  staticConditions: z
    .object({
      from: z.string().optional().describe("The from email address to match"),
      to: z.string().optional().describe("The to email address to match"),
      subject: z.string().optional().describe("The subject to match"),
    })
    .optional()
    .describe("The static conditions to match"),
  group: z
    .enum(["Receipts", "Newsletters"])
    .optional()
    .describe("The group to match"),
});

export async function aiCategorizeRule(
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
    {
      tools: [
        {
          type: "function",
          function: {
            name: "categorizeRule",
            description: "Generate a rule to handle the email",
            parameters: zodToJsonSchema(categorizeRuleResponse),
          },
        },
      ],
    },
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
    const categorizedRule = categorizeRuleResponse.parse(
      parseJSON(contentString),
    );
    return categorizedRule;
  } catch (error) {
    // TODO if there's an error ask the ai to fix it?
    console.error(`Invalid response: ${error} ${contentString}`);
    return;
  }
}

// suggest actions to add to the rule
async function categorizeRule(
  body: CategorizeRuleBody,
  userId: string,
  userEmail: string,
  userAiFields: UserAIFields,
) {
  const rule = await prisma.rule.findUniqueOrThrow({
    where: { id: body.ruleId },
  });

  if (rule.userId !== userId) throw new Error("Unauthorized");

  // ask ai to categorize the rule
  const categorizedRule = await aiCategorizeRule(
    rule.instructions,
    userAiFields,
    userEmail,
  );

  if (!categorizedRule?.actions?.length) return;

  const actions = categorizedRule?.actions;

  // save the result to the rule
  const [, updatedRule] = await prisma.$transaction([
    prisma.action.deleteMany({
      where: {
        ruleId: body.ruleId,
      },
    }),
    prisma.rule.update({
      where: {
        id: body.ruleId,
      },
      data: {
        name: categorizedRule.name,
        actions: {
          createMany: {
            data: actions,
          },
        },
      },
      include: {
        actions: true,
      },
    }),
  ]);

  return updatedRule;
}

export const POST = withError(async (request: Request) => {
  const session = await auth();
  if (!session?.user.email)
    return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categorizeRuleBody.parse(json);

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.user.id },
    select: {
      aiProvider: true,
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  const result = await categorizeRule(
    body,
    session.user.id,
    session.user.email,
    {
      aiProvider: provider,
      aiModel: model,
      openAIApiKey: user.openAIApiKey,
    },
  );

  return NextResponse.json(result);
});
