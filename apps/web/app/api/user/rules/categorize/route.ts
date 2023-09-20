import { z } from "zod";
import { NextResponse } from "next/server";
import { parseJSON } from "@/utils/json";
import { getAuthSession } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { AIModel, UserAIFields, getOpenAI } from "@/utils/openai";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { Action, ActionType, Rule } from "@prisma/client";
import { actionInputs } from "@/utils/actionType";
import { withError } from "@/utils/middleware";

const categorizeRuleBody = z.object({ ruleId: z.string() });
export type CategorizeRuleBody = z.infer<typeof categorizeRuleBody>;
export type CategorizeRuleResponse = Awaited<ReturnType<typeof categorizeRule>>;

async function aiCategorizeRule(
  rule: Rule,
  user: UserAIFields
): Promise<
  Pick<Action, "type" | "label" | "to" | "cc" | "bcc" | "subject" | "content">[]
> {
  const aiResponse = await getOpenAI(user.openAIApiKey).chat.completions.create(
    {
      model: user.aiModel || DEFAULT_AI_MODEL,
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
[{ type: "FORWARD", to: "example@gmail.com" }, { type: "ARCHIVE" }]

Another example response is:
[{ type: "FORWARD" }]

Keep the actions to a minimum. Only "type" is required. Other fields are optional and may only be available at run time. Leave other fields blank if you do not have enough information to fill them out. Do not use an example value.

###
Instruction:
${rule.instructions}`,
        },
      ],
    }
  );

  const contentString = aiResponse.choices?.[0]?.message.content;

  if (!contentString) return [];

  try {
    const contentJson = parseJSON(contentString);

    if (!Array.isArray(contentJson)) {
      // TODO check correct format with zod parse. if there's an error ask the ai to fix it
      console.error(`Invalid response: ${contentString}`);
      return [];
    }

    return contentJson.filter(isAction);
  } catch (error) {
    console.error(`Invalid response: ${error} ${contentString}`);
    return [];
  }
}

function isAction(action: any): action is Action {
  return action?.type in ActionType;
}

// suggest actions to add to the rule
async function categorizeRule(
  body: CategorizeRuleBody,
  userId: string,
  userAiFields: UserAIFields
) {
  const rule = await prisma.rule.findUniqueOrThrow({
    where: { id: body.ruleId },
  });

  if (rule.userId !== userId) throw new Error("Unauthorized");

  // ask ai to categorize the rule
  const actions = await aiCategorizeRule(rule, userAiFields);

  if (!actions.length) return;

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
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

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
