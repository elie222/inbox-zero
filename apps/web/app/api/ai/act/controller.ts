import { gmail_v1 } from "googleapis";
import { z } from "zod";
import uniq from "lodash/uniq";
import { UserAIFields, functionsToTools, getOpenAI } from "@/utils/openai";
import { PartialRecord, RuleWithActions } from "@/utils/types";
import {
  ACTION_PROPERTIES,
  ActionProperty,
  actionFunctionDefs,
  runActionFunction,
} from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { deletePlan, savePlan } from "@/utils/redis/plan";
import { Action, Rule } from "@prisma/client";
import { ActBody, ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { saveUsage } from "@/utils/redis/usage";
import { getOrCreateInboxZeroLabel } from "@/utils/label";
import { labelThread } from "@/utils/gmail/label";
import { DEFAULT_AI_MODEL } from "@/utils/config";
import { ChatCompletionCreateParams } from "openai/resources/chat";
import { parseJSON, parseJSONWithMultilines } from "@/utils/json";

export type ActResponse = Awaited<ReturnType<typeof planAct>>;

type PlannedAction = {
  actions: Pick<Action, "type">[];
  args: PartialRecord<ActionProperty, string>;
};

export const REQUIRES_MORE_INFO = "requires_more_information";

// after some testing i see the AI performs better when it works on smaller tasks
// if we try ask it to select a rule, and provide the args for that rule in one go, it doesn't do as well
// so i've split this up into two ai calls:
// 1. select rule
// 2. generate args for rule

export async function getAiResponse(
  options: {
    email: Pick<ActBody["email"], "from" | "cc" | "replyTo" | "subject"> & {
      content: string;
    };
    userAbout: string;
    userEmail: string;
    functions: ChatCompletionCreateParams.Function[];
  } & UserAIFields,
) {
  const { email, userAbout, userEmail, functions } = options;

  const messages = [
    {
      role: "system" as const,
      content: `You are an AI assistant that helps people manage their emails.
Never put placeholders in your email responses.
Do not mention you are an AI assistant when responding to people.
It's better not to act if you don't know how.

These are the rules you can select from:
${functions.map((f, i) => `${i + 1}. ${f.description}`).join("\n")}`,
    },
    ...(userAbout
      ? [
          {
            role: "user" as const,
            content: `Some additional information the user has provided:\n\n${userAbout}`,
          },
        ]
      : []),
    {
      role: "user" as const,
      content: `This email was received for processing. Select a rule to apply to it.
Respond with a JSON object with the following fields:
"rule" - the number of the rule you want to apply
"reason" - the reason you chose that rule

From: ${email.from}
Reply to: ${email.replyTo}
CC: ${email.cc}
Subject: ${email.subject}
Body:
${email.content}`,
    },
  ];

  const model = options.aiModel || DEFAULT_AI_MODEL;
  const aiResponse = await getOpenAI(
    options.openAIApiKey,
  ).chat.completions.create({
    model,
    messages,
    temperature: 0,
    frequency_penalty: 0,
    presence_penalty: 0,
    response_format: { type: "json_object" },
    // tools: [
    //   {
    //     type: "function",
    //     function: {
    //       name: "selectRule",
    //       description: "Select a rule to apply to the email.",
    //       parameters: {
    //         type: "object",
    //         properties: {
    //           ruleNumber: {
    //             type: "number",
    //             description: "The number of the rule to apply.",
    //           },
    //           reason: {
    //             type: "string",
    //             description: "The reason for choosing this rule.",
    //           },
    //         },
    //         required: ["ruleNumber"],
    //       },
    //     },
    //   },
    // ],
  });

  if (aiResponse.usage)
    await saveUsage({ email: userEmail, usage: aiResponse.usage, model });

  const responseSchema = z.object({
    rule: z.number(),
    reason: z.string().optional(),
  });

  if (!aiResponse.choices[0].message.content) return;

  try {
    return responseSchema.parse(
      parseJSON(aiResponse.choices[0].message.content),
    );
  } catch (error) {
    console.warn(
      "Error parsing data.\nResponse:",
      aiResponse?.choices?.[0]?.message?.content,
      "\nError:",
      error,
    );
    return;
  }
}

async function getArgsAiResponse(
  options: {
    email: Pick<ActBody["email"], "from" | "cc" | "replyTo" | "subject"> & {
      content: string;
    };
    userAbout: string;
    userEmail: string;
    functions: ChatCompletionCreateParams.Function[];
    selectedFunction: ChatCompletionCreateParams.Function;
  } & UserAIFields,
) {
  const { email, userAbout, userEmail, functions, selectedFunction } = options;

  const messages = [
    {
      role: "system" as const,
      content: `You are an AI assistant that helps people manage their emails.
Never put placeholders in your email responses.
Do not mention you are an AI assistant when responding to people.`,
    },
    ...(userAbout
      ? [
          {
            role: "user" as const,
            content: `Some additional information the user has provided about themselves:\n\n${userAbout}`,
          },
        ]
      : []),
    {
      role: "user" as const,
      content: `An email was received for processing and a rule was selected to process it. Please act on this email.

The selected rule:
${selectedFunction.name} - ${selectedFunction.description}

The email:

From: ${email.from}
Reply to: ${email.replyTo}
CC: ${email.cc}
Subject: ${email.subject}
Body:
${email.content}`,
    },
  ];

  const model = options.aiModel || DEFAULT_AI_MODEL;
  const aiResponse = await getOpenAI(
    options.openAIApiKey,
  ).chat.completions.create({
    model,
    messages,
    tools: functionsToTools(functions),
    temperature: 0,
  });

  if (aiResponse.usage)
    await saveUsage({ email: userEmail, usage: aiResponse.usage, model });

  const functionCall =
    aiResponse?.choices?.[0]?.message.tool_calls?.[0]?.function;

  if (!functionCall?.name) return;
  if (functionCall.name === REQUIRES_MORE_INFO) return;

  return functionCall;
}

function getFunctionsFromRules(options: { rules: RuleWithActions[] }) {
  const rulesWithProperties = options.rules.map((rule, i) => {
    const prefilledValues: PartialRecord<ActionProperty, string | null> = {};

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

            return { ...properties, ...actionProperties };
          },
          {} as {
            [key: string]: {
              type: string;
              description: string;
            };
          },
        ),
        required: uniq(
          rule.actions.flatMap((action) => {
            return actionFunctionDefs[action.type].parameters.required;
          }),
        ),
      },
    };
  });

  rulesWithProperties.push({
    name: REQUIRES_MORE_INFO,
    description: "Request more information to handle the email.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
    prefilledValues: {},
    rule: {} as any,
  });

  const functions: ChatCompletionCreateParams.Function[] =
    rulesWithProperties.map((r) => ({
      name: r.name,
      description: r.description,
      parameters: r.parameters,
    }));

  return { functions, rulesWithProperties };
}

export async function planAct(
  options: {
    email: ActBody["email"] & { content: string };
    rules: RuleWithActions[];
    userAbout: string;
    userEmail: string;
  } & UserAIFields,
): Promise<{ rule: Rule; plannedAction: PlannedAction } | undefined> {
  const { email, rules } = options;

  const { functions, rulesWithProperties } = getFunctionsFromRules({ rules });

  const aiResponse = await getAiResponse({
    email,
    userAbout: options.userAbout,
    userEmail: options.userEmail,
    functions,
    aiModel: options.aiModel,
    openAIApiKey: options.openAIApiKey,
  });

  const ruleNumber = aiResponse ? aiResponse.rule - 1 : undefined;
  if (typeof ruleNumber !== "number") {
    console.warn("No rule selected");
    return;
  }

  const selectedRule = rulesWithProperties[ruleNumber];
  console.log("selectedRule", selectedRule);

  if (selectedRule.name === REQUIRES_MORE_INFO) return;

  // TODO may want to pass full email content to this function so it has maximum context to act on
  const aiArgsResponse = await getArgsAiResponse({
    email,
    userAbout: options.userAbout,
    userEmail: options.userEmail,
    functions,
    selectedFunction: selectedRule,
    aiModel: options.aiModel,
    openAIApiKey: options.openAIApiKey,
  });

  const aiGeneratedArgs = aiArgsResponse?.arguments
    ? parseJSONWithMultilines(aiArgsResponse.arguments)
    : undefined;

  // use prefilled values where we have them
  const args = {
    ...aiGeneratedArgs,
    ...selectedRule.prefilledValues,
  };

  return {
    plannedAction: {
      actions: selectedRule.rule.actions,
      args,
    },
    rule: selectedRule.rule,
  };
}

export async function executeAct(options: {
  gmail: gmail_v1.Gmail;
  act: PlannedAction;
  email: ActBodyWithHtml["email"];
  userId: string;
  userEmail: string;
  automated: boolean;
  ruleId: string;
}) {
  const { gmail, email, act, automated, userId, userEmail, ruleId } = options;

  console.log("Executing act:", JSON.stringify(act, null, 2));

  await Promise.all(
    act.actions.map(async (action) => {
      return runActionFunction(gmail, email, action.type, act.args, userEmail);
    }),
  );

  async function labelActed() {
    const label = await getOrCreateInboxZeroLabel({
      gmail,
      email: userEmail,
      labelKey: "acted",
    });

    if (!label) return;

    return labelThread({
      gmail,
      labelId: label.id,
      threadId: email.threadId,
    });
  }

  await Promise.all([
    prisma.executedRule.create({
      data: {
        actions: act.actions.map((a) => a.type),
        data: act.args,
        messageId: email.messageId,
        threadId: email.threadId,
        automated,
        userId,
        ruleId,
      },
    }),
    labelActed(),
    // TODO mark plan as acted upon
    deletePlan({ userId, threadId: email.threadId }),
  ]);
}

export async function planOrExecuteAct(
  options: {
    gmail: gmail_v1.Gmail;
    email: ActBodyWithHtml["email"] & { content: string };
    rules: RuleWithActions[];
    allowExecute: boolean;
    forceExecute?: boolean;
    userId: string;
    userEmail: string;
    userAbout: string;
    automated: boolean;
  } & UserAIFields,
) {
  if (!options.rules.length) return;

  const plannedAct = await planAct(options);

  console.log("Planned act:", plannedAct);

  if (!plannedAct) {
    await savePlan({
      userId: options.userId,
      threadId: options.email.threadId,
      plan: {
        createdAt: new Date(),
        messageId: options.email.messageId,
        threadId: options.email.threadId,
        rule: null,
      },
    });

    return;
  }

  const shouldExecute =
    options.allowExecute && (plannedAct.rule?.automate || options.forceExecute);

  console.log("shouldExecute:", shouldExecute);

  if (shouldExecute) {
    await executeAct({
      ...options,
      act: plannedAct.plannedAction,
      email: options.email,
      ruleId: plannedAct.rule.id,
    });
  } else {
    await savePlan({
      userId: options.userId,
      threadId: options.email.threadId,
      plan: {
        createdAt: new Date(),
        messageId: options.email.messageId,
        threadId: options.email.threadId,
        rule: { ...plannedAct.rule, actions: plannedAct.plannedAction.actions },
        functionArgs: plannedAct.plannedAction.args,
      },
    });
  }

  return plannedAct;
}
