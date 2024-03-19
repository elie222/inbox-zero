import { type gmail_v1 } from "googleapis";
import { z } from "zod";
import uniq from "lodash/uniq";
import { UserAIFields } from "@/utils/llms/types";
import { PartialRecord, RuleWithActions } from "@/utils/types";
import {
  ACTION_PROPERTIES,
  ActionProperty,
  actionFunctionDefs,
  runActionFunction,
} from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { ExecutedAction, Rule } from "@prisma/client";
import { ActBody, ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { getOrCreateInboxZeroLabel } from "@/utils/label";
import { labelThread } from "@/utils/gmail/label";
import { ChatCompletionCreateParams } from "openai/resources/index";
import { parseJSON, parseJSONWithMultilines } from "@/utils/json";
import { saveAiUsage } from "@/utils/usage";
import { AI_GENERATED_FIELD_VALUE } from "@/utils/config";
import { parseEmail } from "@/utils/mail";
import {
  chatCompletion,
  chatCompletionTools,
  getAiProviderAndModel,
} from "@/utils/llms";
import { ExecutedRuleStatus } from "@prisma/client";

export type ActResponse = Awaited<ReturnType<typeof planOrExecuteAct>>;

type PlannedAction = {
  actions: Pick<ExecutedAction, "type">[];
  args: PartialRecord<ActionProperty, string | null>;
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
      snippet: string;
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
${email.snippet}`,
    },
  ];

  const { model, provider } = getAiProviderAndModel(
    options.aiProvider,
    options.aiModel,
  );
  const aiResponse = await chatCompletion(
    provider,
    model,
    options.openAIApiKey,
    messages,
    { jsonResponse: true },
  );
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

  if (aiResponse.usage) {
    await saveAiUsage({
      email: userEmail,
      usage: aiResponse.usage,
      provider: options.aiProvider,
      model,
      label: "Choose rule",
    });
  }

  const responseSchema = z.object({
    rule: z.number(),
    reason: z.string().optional(),
  });

  if (!aiResponse.response) return;

  try {
    const result = responseSchema.parse(parseJSON(aiResponse.response));
    return result;
  } catch (error) {
    console.warn(
      "Error parsing data.\nResponse:",
      aiResponse?.response,
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
    selectedFunction: ChatCompletionCreateParams.Function;
  } & UserAIFields,
) {
  const { email, userAbout, userEmail, selectedFunction } = options;

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

  const { model, provider } = getAiProviderAndModel(
    options.aiProvider,
    options.aiModel,
  );

  console.log("Calling chat completion tools");

  const aiResponse = await chatCompletionTools(
    provider,
    model,
    options.openAIApiKey,
    messages,
    {
      tools: [
        {
          type: "function",
          function: {
            name: selectedFunction.name,
            description: "Act on the email using the selected rule.",
            parameters: selectedFunction.parameters,
          },
        },
      ],
    },
  );

  if (aiResponse.usage) {
    await saveAiUsage({
      email: userEmail,
      usage: aiResponse.usage,
      provider: options.aiProvider,
      model,
      label: "Args for rule",
    });
  }

  const functionCall = aiResponse.functionCall;

  if (!functionCall?.name) return;
  if (functionCall.name === REQUIRES_MORE_INFO) return;

  return functionCall;
}

function getFunctionsFromRules(options: { rules: RuleWithActions[] }) {
  const rulesWithProperties = options.rules.map((rule, i) => {
    const prefilledValues: PartialRecord<ActionProperty, string | null> = {};
    // const toAiGenerateValues: PartialRecord<ActionProperty, true> = {};
    const toAiGenerateValues: ActionProperty[] = [];

    rule.actions.forEach((action) => {
      ACTION_PROPERTIES.forEach((property) => {
        if (action[property] === AI_GENERATED_FIELD_VALUE) {
          toAiGenerateValues.push(property);
        } else if (action[property]) {
          prefilledValues[property] = action[property];
        }
      });
    });

    const shouldAiGenerateArgs = toAiGenerateValues.length > 0;

    return {
      rule,
      prefilledValues,
      shouldAiGenerateArgs,
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
    shouldAiGenerateArgs: false,
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
    email: ActBody["email"] & { content: string; snippet: string };
    rules: RuleWithActions[];
    userAbout: string;
    userEmail: string;
  } & UserAIFields,
): Promise<
  | { rule: Rule; plannedAction: PlannedAction; reason?: string }
  | { rule?: undefined; plannedAction?: undefined; reason?: string }
> {
  const { email, rules } = options;

  const { functions, rulesWithProperties } = getFunctionsFromRules({ rules });

  const aiResponse = await getAiResponse({
    email,
    userAbout: options.userAbout,
    userEmail: options.userEmail,
    functions,
    aiProvider: options.aiProvider,
    aiModel: options.aiModel,
    openAIApiKey: options.openAIApiKey,
  });

  const ruleNumber = aiResponse ? aiResponse.rule - 1 : undefined;
  if (typeof ruleNumber !== "number") {
    console.warn("No rule selected");
    return { reason: aiResponse?.reason };
  }

  const selectedRule = rulesWithProperties[ruleNumber];
  console.log("selectedRule", selectedRule.name);

  if (selectedRule.name === REQUIRES_MORE_INFO)
    return { reason: aiResponse?.reason };

  // TODO may want to pass full email content to this function so it has maximum context to act on
  const aiArgsResponse = selectedRule.shouldAiGenerateArgs
    ? await getArgsAiResponse({
        email,
        userAbout: options.userAbout,
        userEmail: options.userEmail,
        selectedFunction: selectedRule,
        aiProvider: options.aiProvider,
        aiModel: options.aiModel,
        openAIApiKey: options.openAIApiKey,
      })
    : { arguments: undefined };

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
    reason: aiResponse?.reason,
  };
}

export async function executeAct(options: {
  gmail: gmail_v1.Gmail;
  act: PlannedAction;
  email: ActBodyWithHtml["email"];
  userEmail: string;
  executedRuleId: string;
}) {
  const { gmail, email, act, userEmail, executedRuleId } = options;

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
    prisma.executedRule.update({
      where: { id: executedRuleId },
      data: { status: ExecutedRuleStatus.APPLIED },
    }),
    labelActed(),
  ]);
}

export async function planOrExecuteAct(
  options: {
    gmail: gmail_v1.Gmail;
    email: ActBodyWithHtml["email"];
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

  const content =
    (options.email.textHtml &&
      parseEmail(options.email.textHtml, false, null)) ||
    options.email.textPlain ||
    options.email.snippet;

  const plannedAct = await planAct({
    ...options,
    email: {
      ...options.email,
      content: content || "",
      snippet: options.email.snippet || "",
    },
  });

  console.log(
    "Planned act:",
    plannedAct.rule?.name,
    plannedAct.plannedAction?.actions.map((a) => a.type),
    plannedAct.plannedAction?.args,
  );

  // no rule to apply to this thread
  if (!plannedAct.rule) {
    await prisma.executedRule.upsert({
      where: {
        unique_user_thread_message: {
          userId: options.userId,
          threadId: options.email.threadId,
          messageId: options.email.messageId,
        },
      },
      create: {
        threadId: options.email.threadId,
        messageId: options.email.messageId,
        automated: options.automated,
        reason: plannedAct.reason,
        status: ExecutedRuleStatus.SKIPPED,
        user: { connect: { id: options.userId } },
      },
      update: {
        threadId: options.email.threadId,
        messageId: options.email.messageId,
        automated: options.automated,
        reason: plannedAct.reason,
        status: ExecutedRuleStatus.SKIPPED,
        user: { connect: { id: options.userId } },
      },
    });

    return plannedAct;
  }

  const shouldExecute =
    options.allowExecute && (plannedAct.rule.automate || options.forceExecute);

  console.log("shouldExecute:", shouldExecute);

  const executedRule = options.email.messageId
    ? await prisma.executedRule.create({
        data: {
          actionItems: {
            createMany: {
              data: plannedAct.plannedAction.actions.map((action) => ({
                type: action.type,
                label: plannedAct.plannedAction.args.label,
                subject: plannedAct.plannedAction.args.subject,
                content: plannedAct.plannedAction.args.content,
                to: plannedAct.plannedAction.args.to,
                cc: plannedAct.plannedAction.args.cc,
                bcc: plannedAct.plannedAction.args.bcc,
              })),
            },
          },
          messageId: options.email.messageId,
          threadId: options.email.threadId,
          automated: plannedAct.rule.automate,
          status: ExecutedRuleStatus.PENDING,
          reason: plannedAct.reason,
          rule: plannedAct.rule.id
            ? { connect: { id: plannedAct.rule.id } }
            : undefined,
          user: { connect: { id: options.userId } },
        },
      })
    : undefined;

  if (shouldExecute && executedRule) {
    await executeAct({
      ...options,
      act: plannedAct.plannedAction,
      email: options.email,
      executedRuleId: executedRule.id,
    });
  }

  return plannedAct;
}
