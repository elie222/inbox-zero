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
import {
  ACTION_PROPERTIES,
  ActionProperty,
  actionFunctionDefs,
  runActionFunction,
} from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { deletePlan, savePlan } from "@/utils/redis/plan";
import { Action, Rule } from "@prisma/client";
import { ActBody } from "@/app/api/ai/act/validation";
import { saveUsage } from "@/utils/redis/usage";
import { getOrCreateInboxZeroLabel } from "@/utils/label";
import { labelThread } from "@/utils/gmail/label";
import { AI_MODEL } from "@/utils/config";

export type ActResponse = Awaited<ReturnType<typeof planAct>>;

type PlannedAction = {
  args: PartialRecord<ActionProperty, string>;
  actions: Pick<Action, "type">[];
};

async function planAct(options: {
  email: ActBody["email"];
  rules: RuleWithActions[];
  userAbout: string;
  userEmail: string;
}): Promise<(PlannedAction & { rule: Rule }) | undefined> {
  const { email, rules } = options;

  const rulesWithProperties = rules.map((rule, i) => {
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
          }
        ),
        required: rule.actions.flatMap((action) => {
          return actionFunctionDefs[action.type].parameters.required;
        }),
      },
    };
  });

  const REQUIRES_MORE_INFO = "requires_more_information";

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

  const functions = rulesWithProperties.map((r) => ({
    name: r.name,
    description: r.description,
    parameters: r.parameters,
  }));

  // const model = "gpt-4"; // gpt-4 is better at this but costs a lot more :(
  const model = AI_MODEL; // gpt3.5 is cheaper

  const aiResponse = await openai.createChatCompletion({
    model,
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that helps people manage their emails. You don't make decisions without asking for more information. Never put placeholders in your emails. Do not make things up.`,
        // These are the rules to follow:
        // ${rules
        //   .map(
        //     (r, i) =>
        //       `${i + 1}. ${
        //         r.instructions
        //       }\nThe actions that can be taken with this rule are: ${r.actions}`
        //   )
        //   .join("\n\n")}`,
      },
      ...(options.userAbout
        ? [
            {
              role: "user" as const,
              content: `Some additional information the user has provided:\n\n${options.userAbout}`,
            },
          ]
        : []),
      {
        role: "user",
        content: `This email was received for processing:

From: ${email.from}
Reply to: ${email.replyTo}
CC: ${email.cc}
Subject: ${email.subject}
Email:
${email.content}`,
      },
    ],
    functions,
    function_call: "auto",
    temperature: 0,
  });

  const json: ChatCompletionResponse | ChatCompletionError =
    await aiResponse.json();

  if (isChatCompletionError(json)) {
    console.error(json);
    return;
  }

  await saveUsage({ email: options.userEmail, usage: json.usage, model });

  const functionCall = json?.choices?.[0]?.message.function_call as
    | ChatCompletionRequestMessageFunctionCall
    | undefined;

  if (!functionCall?.name) return;

  console.log("functionCall:", functionCall);

  if (functionCall.name === REQUIRES_MORE_INFO) return;

  const aiGeneratedArgs = functionCall.arguments
    ? json5.parse(functionCall.arguments)
    : undefined;

  const selectedRuleNumber = parseInt(functionCall.name.split("_")[1]);

  const selectedRule = rulesWithProperties[selectedRuleNumber - 1];

  // use prefilled values where we have them
  const args = {
    ...aiGeneratedArgs,
    ...selectedRule.prefilledValues,
  };

  console.log("args:", args);

  return {
    actions: selectedRule.rule.actions,
    args,
    rule: selectedRule.rule,
  };
}

export async function executeAct(options: {
  gmail: gmail_v1.Gmail;
  act: PlannedAction;
  email: ActBody["email"];
  userId: string;
  userEmail: string;
  automated: boolean;
  ruleId: string;
}) {
  const { gmail, email, act, automated, userId, userEmail, ruleId } = options;

  console.log("Executing act:", JSON.stringify(act, null, 2));

  await Promise.all(
    act.actions.map(async (action) => {
      return runActionFunction(gmail, email, action.type, act.args);
    })
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

export async function planOrExecuteAct(options: {
  gmail: gmail_v1.Gmail;
  email: ActBody["email"];
  rules: RuleWithActions[];
  allowExecute: boolean;
  forceExecute?: boolean;
  userId: string;
  userEmail: string;
  userAbout: string;
  automated: boolean;
}) {
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
      act: plannedAct,
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
        rule: { ...plannedAct.rule, actions: plannedAct.actions },
        functionArgs: plannedAct.args,
      },
    });
  }

  return plannedAct;
}
