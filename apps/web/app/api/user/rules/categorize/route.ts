import { z } from "zod";
import { NextResponse } from "next/server";
import { parseJSON } from "@/utils/json";
import { auth } from "@/app/api/auth/[...nextauth]/auth";
import prisma from "@/utils/prisma";
import { AIModel, UserAIFields, getOpenAI } from "@/utils/openai";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { Action, ActionType, Rule } from "@prisma/client";
import { actionInputs } from "@/utils/actionType";
import { withError } from "@/utils/middleware";

const categorizeRuleBody = z.object({ ruleId: z.string() });
export type CategorizeRuleBody = z.infer<typeof categorizeRuleBody>;
export type CategorizeRuleResponse = Awaited<ReturnType<typeof categorizeRule>>;

const categorizeRuleResponse = z.object({
  name: z.string(),
  actions: z.array(
    z.object({
      type: z.nativeEnum(ActionType),
      label: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
      to: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
      cc: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
      bcc: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
      subject: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
      content: z
        .string()
        .nullish()
        .transform((v) => v ?? null),
    }),
  ),
});

async function aiCategorizeRule(
  rule: Rule,
  user: UserAIFields,
): Promise<{
  name: string;
  actions: Pick<
    Action,
    "type" | "label" | "to" | "cc" | "bcc" | "subject" | "content"
  >[];
} | void> {
  const aiResponse = await getOpenAI(user.openAIApiKey).chat.completions.create(
    {
      model: user.aiModel || DEFAULT_AI_MODEL,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an AI assistant that helps people manage their emails. This is the list of actions you are able to take:
${Object.entries(actionInputs).map(([actionType, { fields }]) => {
  return `- ${actionType}
    Optional fields: ${fields.map((field) => field.name).join(", ")}`;
})}`,
        },
        {
          role: "user",
          content: `Return a JSON array of actions that this instruction would require taking.

An example response is:
{ "name": "Archive examples", "actions": [{ type: "FORWARD", to: "example@gmail.com" }, { type: "ARCHIVE" }] }

Another example response is:
{ "name": "Forward XYZ", "actions": [{ type: "FORWARD" }] }

Keep the actions to a minimum.
Only "type" is required. Other fields are optional and may only be available at runtime.
Leave other fields blank if you do not have enough information to fill them out.
Do not use an example value.
"name" should be 1-2 words that describe the rule.

###
Instruction:
${rule.instructions}`,
        },
      ],
    },
  );

  const contentString = aiResponse.choices?.[0]?.message.content;

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
  userAiFields: UserAIFields,
) {
  const rule = await prisma.rule.findUniqueOrThrow({
    where: { id: body.ruleId },
  });

  if (rule.userId !== userId) throw new Error("Unauthorized");

  // ask ai to categorize the rule
  const categorizedRule = await aiCategorizeRule(rule, userAiFields);

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
      aiModel: true,
      openAIApiKey: true,
    },
  });

  const result = await categorizeRule(body, session.user.id, {
    aiModel: user.aiModel as AIModel,
    openAIApiKey: user.openAIApiKey,
  });

  return NextResponse.json(result);
});
