import { z } from "zod";
import { NextResponse } from "next/server";
import { getAuthSession } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { openai } from "@/utils/openai";
import { AI_MODEL } from "@/utils/config";
import { Action, Rule } from "@prisma/client";
import {
  ChatCompletionResponse,
  ChatCompletionError,
  isChatCompletionError,
} from "@/utils/types";

const categorizeRuleBody = z.object({ ruleId: z.string() });
export type CategorizeRuleBody = z.infer<typeof categorizeRuleBody>;
export type CategorizeRuleResponse = Awaited<ReturnType<typeof categorizeRule>>;

async function aiCategorizeRule(rule: Rule): Promise<Action[]> {
  const aiResponse = await openai.createChatCompletion({
    model: AI_MODEL,
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that helps people manage their emails. This is the list of actions you are able to take: ${Object.keys(
          Action
        ).join(", ")}.`,
      },
      {
        role: "user",
        content: `Return a JSON array of actions that this instruction would require taking.

An example response is:
["FORWARD"]

Keep the actions to a minimum.

###
Instruction:
${rule.instructions}`,
      },
    ],
  });

  const json: ChatCompletionResponse | ChatCompletionError =
    await aiResponse.json();

  if (isChatCompletionError(json)) {
    console.error(json);
    return [];
  }

  const contentString = json.choices?.[0]?.message.content;
  const contentJson = JSON.parse(contentString);

  if (!Array.isArray(contentJson)) {
    console.error(`Invalid response: ${contentString}`);
    return [];
  }

  return contentJson.filter(isAction);
}

function isAction(action: string): action is Action {
  return action in Action;
}

// suggest actions to add to the rule
async function categorizeRule(body: CategorizeRuleBody, userId: string) {
  const rule = await prisma.rule.findUniqueOrThrow({
    where: { id: body.ruleId },
  });

  if (rule.userId !== userId) throw new Error("Unauthorized");

  // ask ai to categorize the rule
  const actions = await aiCategorizeRule(rule);

  // save the result to the rule
  const result = await prisma.rule.update({
    where: {
      id: body.ruleId,
    },
    data: {
      actions: {
        set: actions,
      },
      // extraActionData: [],
    },
  });

  return result;
}

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" });

  const json = await request.json();
  const body = categorizeRuleBody.parse(json);

  const result = await categorizeRule(body, session.user.id);

  return NextResponse.json(result);
}
