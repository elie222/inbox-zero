import { z } from "zod";
import json5 from "json5";
import { type ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import { gmail_v1 } from "googleapis";
import { openai } from "@/utils/openai";
import {
  ChatCompletionError,
  ChatCompletionResponse,
  PartialRecord,
  RuleWithActions,
  isChatCompletionError,
} from "@/utils/types";
import { actionFunctionDefs, runActionFunction } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { deletePlan, savePlan } from "@/utils/redis/plan";

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

type FunctionCall = {
  name: string;
  args: Record<string, any>;
  rule: RuleWithActions;
};

const ACTION_PROPERTIES = [
  "label",
  "to",
  "cc",
  "bcc",
  "subject",
  "content",
] as const;

async function planAct(options: {
  body: ActBody;
  rules: RuleWithActions[];
}): Promise<FunctionCall | undefined> {
  const { body, rules } = options;

  const rulesWithProperties = rules.map((rule, i) => {
    const prefilledValues: PartialRecord<
      (typeof ACTION_PROPERTIES)[number],
      string | null
    > = {};

    rule.actions.forEach((action) => {
      ACTION_PROPERTIES.forEach((property) => {
        if (action[property]) {
          prefilledValues[property] = action[property];
        }
      });
    });

    return {
      rule,
      prefilledValues,
      name: `rule_${i + 1}`,
      description: rule.instructions,
      parameters: {
        type: "object",
        properties: rule.actions.reduce(
          (properties, action) => {
            const actionProperties = {
              ...actionFunctionDefs[action.type].parameters.properties,
            };

            // filter out properties that we already have a value for
            // eg. if we already have a label, don't ask for it again
            ACTION_PROPERTIES.forEach((v) => {
              if (action[v]) {
                delete actionProperties[v];
              }
            });

            return { ...properties, ...actionProperties };
          },
          {} as {
            [key: string]: {
              type: string;
              description: string;
            };
          }
        ),
        required: [],
      },
    };
  });

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
    functions: rulesWithProperties,
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

  const aiGeneratedArgs = functionCall.arguments
    ? json5.parse(functionCall.arguments)
    : undefined;

  const selectedRuleNumber = parseInt(functionCall.name.split("_")[1]);

  const ruleWithProperty = rulesWithProperties[selectedRuleNumber - 1];

  const args = {
    ...aiGeneratedArgs,
    ...ruleWithProperty.prefilledValues,
  };

  return {
    name: functionCall.name,
    args,
    rule: ruleWithProperty.rule,
  };
}

async function executeAct(options: {
  gmail: gmail_v1.Gmail;
  functionCall: FunctionCall;
  messageId: string;
  threadId: string;
  userId: string;
  automated: boolean;
}) {
  const { gmail, functionCall } = options;

  console.log("Executing functionCall:", functionCall);

  const result = await runActionFunction(
    gmail,
    functionCall.name,
    functionCall.args
  );

  await Promise.all([
    prisma.executedRule.create({
      data: {
        actions: functionCall.rule?.actions.map((a) => a.type),
        data: functionCall.args,
        messageId: options.messageId,
        threadId: options.threadId,
        automated: options.automated,
        userId: options.userId,
        ruleId: functionCall.rule.id,
      },
    }),
    deletePlan({
      userId: options.userId,
      threadId: options.threadId,
    }),
  ]);

  return result;
}

export async function planOrExecuteAct(options: {
  gmail: gmail_v1.Gmail;
  body: ActBody;
  rules: RuleWithActions[];
  allowExecute: boolean;
  forceExecute?: boolean;
  messageId: string;
  threadId: string;
  userId: string;
  automated: boolean;
}) {
  const functionCall = await planAct(options);

  if (!functionCall) return;

  const shouldExcute =
    options.allowExecute &&
    (functionCall.rule?.automate || options.forceExecute);

  if (shouldExcute) {
    await executeAct({ ...options, functionCall });
  } else {
    await savePlan({
      userId: options.userId,
      threadId: options.threadId,
      plan: {
        createdAt: new Date(),
        messageId: options.messageId,
        threadId: options.threadId,
        rule: functionCall.rule,
        functionArgs: functionCall.args,
      },
    });
  }

  return functionCall;
}
