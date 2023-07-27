import { z } from "zod";
import { type ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import { gmail_v1 } from "googleapis";
import { openai } from "@/utils/openai";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  isChatCompletionError,
} from "@/utils/types";
import { actionFunctions, runActionFunction } from "@/utils/ai/actions";
import { Action, Rule } from "@prisma/client";
import prisma from "@/utils/prisma";

export const actBody = z.object({
  from: z.string(),
  replyTo: z.string().optional(),
  cc: z.string().optional(),
  subject: z.string(),
  message: z.string(),
  messageId: z.string().optional(),
  threadId: z.string().optional(),
  allowExecute: z.boolean().optional(),
  forceExecute: z.boolean().optional(),
});
export type ActBody = z.infer<typeof actBody>;
export type ActResponse = Awaited<ReturnType<typeof planAct>>;

type FunctionCall = { name: string; args: Record<string, any>; rule?: Rule };

export async function planAct(options: {
  body: ActBody;
  rules: Rule[];
}): Promise<FunctionCall | undefined> {
  const { body, rules } = options;

  // we filter the actions so that the ai does not try execute functions it isn't permitted to
  const allowActions = rules.map((r) => r.actions).flat();
  const allowedFunctions = actionFunctions.filter(
    (f) => !f.action || allowActions.includes(f.action)
  );

  const aiResponse = await openai.createChatCompletion({
    model: "gpt-4", // gpt-3.5-turbo is not good at this
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that helps people manage their emails. You don't make decisions without asking for more information.
        
These are the rules to follow:
${rules
  .map(
    (r, i) =>
      `${i + 1}. ${
        r.instructions
      }\nThe actions that can be taken with this rule are: ${r.actions}`
  )
  .join("\n\n")}`,
      },
      {
        role: "user",
        content: `From: ${body.from}
Reply to: ${body.replyTo}
CC: ${body.cc}
Subject: ${body.subject}
Email:
${body.message}`,
      },
    ],
    functions: allowedFunctions,
    function_call: "auto",
  });

  const json: ChatCompletionResponse | ChatCompletionError =
    await aiResponse.json();

  if (isChatCompletionError(json)) {
    console.error(json);
    return;
  }

  const functionCall = json?.choices?.[0]?.message.function_call as
    | ChatCompletionRequestMessageFunctionCall
    | undefined;

  if (!functionCall?.name) return;

  console.log("functionCall:", functionCall);

  const args = functionCall.arguments
    ? JSON.parse(functionCall.arguments)
    : undefined;

  return {
    name: functionCall.name,
    args,
    rule:
      typeof args?.ruleNumber === "number"
        ? rules[args.ruleNumber - 1]
        : undefined,
  };
}

async function executeAct(options: {
  gmail: gmail_v1.Gmail;
  functionCall: FunctionCall;
  messageId: string;
  threadId: string;
  userId: string;
}) {
  const { gmail, functionCall } = options;

  console.log("Executing functionCall:", functionCall);

  const result = await runActionFunction(
    gmail,
    functionCall.name,
    functionCall.args
  );

  await prisma.executedAction.create({
    data: {
      action: functionCall.name as Action,
      functionName: functionCall.name,
      functionArgs: functionCall.args,
      automated: true,
      messageId: options.messageId,
      threadId: options.threadId,
      userId: options.userId,
    },
  });

  return result;
}

export async function planAndExecuteAct(options: {
  gmail: gmail_v1.Gmail;
  body: ActBody;
  rules: Rule[];
  forceExecute?: boolean;
  messageId: string;
  threadId: string;
  userId: string;
}) {
  const functionCall = await planAct(options);

  if (!functionCall) return;

  if (functionCall.rule?.automate || options.forceExecute) {
    // make sure that the function call matches the rule
    // eg. avoid a situation where the rule says to reply but the ai says to draft
    const isValidRule = functionCall.rule?.actions.includes(
      functionCall.name as Action
    );

    if (isValidRule) {
      await executeAct({ ...options, functionCall });
    } else {
      // TODO ask AI to fix this and use an action from the rule
    }
  }

  return functionCall;
}
