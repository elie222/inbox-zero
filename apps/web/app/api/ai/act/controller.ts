import json5 from "json5";
import { type ChatCompletionRequestMessageFunctionCall } from "openai-edge";
import { gmail_v1 } from "googleapis";
import { z } from "zod";
import { openai } from "@/utils/openai";
import {
  AiModel,
  ChatCompletionError,
  ChatCompletionResponse,
  ChatFunction,
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

const REQUIRES_MORE_INFO = "requires_more_information";

const responseSchema = z.object({
  score: z.number(),
  explanation: z.string(),
});

async function getAiResponse(options: {
  model: AiModel;
  email: ActBody["email"];
  userAbout: string;
  userEmail: string;
  functions: ChatFunction[];
}) {
  const { model, email, userAbout, userEmail, functions } = options;

  console.log("email.textPlain", email.textPlain);

  const aiResponse = await openai.createChatCompletion({
    model,
    messages: [
      {
        role: "system",
        content: `You are an AI assistant that helps people manage their emails.
Never put placeholders in your email responses.
Be cautious when responding and if you're uncertain always ask for more information.`,
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
      ...(userAbout
        ? [
            {
              role: "user" as const,
              content: `Some additional information the user has provided:\n\n${userAbout}`,
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
${email.textPlain}`,
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

  // is there usage upon error?
  await saveUsage({ email: userEmail, usage: json.usage, model });

  const functionCall = json?.choices?.[0]?.message.function_call as
    | ChatCompletionRequestMessageFunctionCall
    | undefined;

  if (!functionCall?.name) return;

  console.log("functionCall:", functionCall);

  if (functionCall.name === REQUIRES_MORE_INFO) return;

  return functionCall;
}

async function checkAiResponse(options: {
  subject: string;
  textPlain: string;
  chosenInstructions: string;
}) {
  console.log("Checking AI response");

  // Stricter alternative: Please not that you must be extra diligent as the AI often hallucinates and makes mistakes that might initially seem correct.
  async function callAi() {
    const content = `I have an AI assistant that helps me handle my emails based on rules I provided it.
What do you make of its choice of response?

It is your job to respond with properly formatted JSON that includes two fields:
"score" - a number between 0 and 1 that represents how good the AI assistant's response was
"explanation" - a string that explains why the AI assistant's response is good or bad

The email:

###
Subject:
${options.subject}

Body:
${options.textPlain}

###
        
This is the rule it selected from a set of rules I had given it to choose from:

${options.chosenInstructions}
`;
    console.log("content:", content);

    const aiResponse = await openai.createChatCompletion({
      model: AI_MODEL,
      messages: [
        {
          role: "user",
          content,
        },
      ],
    });

    const json: ChatCompletionResponse | ChatCompletionError =
      await aiResponse.json();

    if (isChatCompletionError(json)) {
      console.error(json);
      return;
    }

    const text = json.choices[0].message;

    try {
      const res: { score: number; explanation: number } = json5.parse(
        text.content
      );

      return res;
    } catch (error) {
      console.error("Error parsing json:", text);
      throw error;
    }
  }

  // might want to loop this instead till the ai responds with the correct json?
  const aiRes = await callAi();
  if (!responseSchema.safeParse(aiRes).success) {
    const aiRes2 = await callAi();
    if (responseSchema.safeParse(aiRes).success) return aiRes2;
  }

  return aiRes;
}

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

  const functions: ChatFunction[] = rulesWithProperties.map((r) => ({
    name: r.name,
    description: r.description,
    parameters: r.parameters,
  }));

  // gpt3.5 is much cheaper but halucinates more than gpt4 (which isn't perfect either)
  const functionCall = await getAiResponse({
    model: AI_MODEL,
    email,
    userAbout: options.userAbout,
    userEmail: options.userEmail,
    functions,
  });

  const functionCallName = functionCall?.name;
  const functionCallArguments = functionCall?.arguments;

  if (!functionCallName) return;

  const aiGeneratedArgs = functionCallArguments
    ? json5.parse(functionCallArguments)
    : undefined;

  const selectedRule = rulesWithProperties.find(
    (f) => f.name === functionCallName
  );
  if (!selectedRule) {
    console.warn("Rule not found for functionCallName:", functionCallName);
    return;
  }

  const check = await checkAiResponse({
    subject: email.subject,
    textPlain: email.textPlain!,
    chosenInstructions: selectedRule.rule.instructions,
  });

  console.log(
    "Check score",
    check?.score,
    ". Explanation:",
    check?.explanation
  );

  if (!check || check.score < 0.7) {
    console.log(
      `The AI is not confident on the response. Skipping. Check: ${JSON.stringify(
        check,
        null,
        2
      )}`
    );
    return;
  }

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
