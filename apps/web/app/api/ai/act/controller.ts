import { type gmail_v1 } from "googleapis";
import { z } from "zod";
import uniq from "lodash/uniq";
import { UserAIFields } from "@/utils/llms/types";
import { RuleWithActions } from "@/utils/types";
import {
  ACTION_PROPERTIES,
  ActionItem,
  ActionProperty,
  actionFunctionDefs,
  runActionFunction,
} from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { Rule } from "@prisma/client";
import { ActBody, ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { getOrCreateInboxZeroLabel } from "@/utils/label";
import { labelThread } from "@/utils/gmail/label";
import { Function } from "ai";
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
    functions: { description?: string }[];
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
    selectedFunction: Function;
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

// This finds the properties that must be generated by the AI.
// NOTE: if two actions require the same field, the AI will generate the same value for both.
// For example, if two actions require the "content" field, the AI will generate the same content for both.
// We probably want to improve this in the future. So that action1.content and action2.content are different.
function getFunctionsFromRules(options: { rules: RuleWithActions[] }) {
  const rulesWithProperties = options.rules.map((rule, i) => {
    const toAiGenerateValues: ActionProperty[] = [];

    rule.actions.forEach((action) => {
      ACTION_PROPERTIES.forEach((property) => {
        if (action[property] === AI_GENERATED_FIELD_VALUE) {
          toAiGenerateValues.push(property);
        }
      });
    });

    const shouldAiGenerateArgs = toAiGenerateValues.length > 0;

    return {
      rule,
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
    shouldAiGenerateArgs: false,
    rule: {} as any,
  });

  const functions: Function[] = rulesWithProperties.map((r) => ({
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
  | {
      rule: Rule;
      actionItems: ActionItem[];
      reason?: string;
    }
  | { rule?: undefined; actionItems?: undefined; reason?: string }
> {
  const { email, rules } = options;
  const { functions, rulesWithProperties } = getFunctionsFromRules({ rules });

  const aiResponse = await getAiResponse({
    ...options,
    email,
    functions,
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
        ...options,
        email,
        selectedFunction: selectedRule,
      })
    : { arguments: undefined };

  const aiGeneratedArgs: Omit<ActionItem, "type"> | undefined =
    aiArgsResponse?.arguments
      ? parseJSONWithMultilines(aiArgsResponse.arguments)
      : undefined;

  return {
    rule: selectedRule.rule,
    actionItems: selectedRule.rule.actions.map(
      ({ type, label, subject, content, to, cc, bcc }) => {
        // use prefilled values where we have them
        return {
          type,
          label:
            label === AI_GENERATED_FIELD_VALUE ? aiGeneratedArgs?.label : label,
          subject:
            subject === AI_GENERATED_FIELD_VALUE
              ? aiGeneratedArgs?.subject
              : subject,
          content:
            content === AI_GENERATED_FIELD_VALUE
              ? aiGeneratedArgs?.content
              : content,
          to: to === AI_GENERATED_FIELD_VALUE ? aiGeneratedArgs?.to : to,
          cc: cc === AI_GENERATED_FIELD_VALUE ? aiGeneratedArgs?.cc : cc,
          bcc: bcc === AI_GENERATED_FIELD_VALUE ? aiGeneratedArgs?.bcc : bcc,
        };
      },
    ),
    reason: aiResponse?.reason,
  };
}

export async function executeAct(options: {
  gmail: gmail_v1.Gmail;
  actionItems: ActionItem[];
  email: ActBodyWithHtml["email"];
  userEmail: string;
  executedRuleId: string;
}) {
  const { gmail, email, actionItems, userEmail, executedRuleId } = options;

  console.log("Executing act:", JSON.stringify(actionItems, null, 2));

  await Promise.all(
    actionItems.map(async (action) => {
      return runActionFunction(gmail, email, action, userEmail);
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

  await Promise.allSettled([
    prisma.executedRule.update({
      where: { id: executedRuleId },
      data: { status: ExecutedRuleStatus.APPLIED },
    }),
    labelActed(),
  ]);
}

type PlanOrExecuteActOptions = {
  gmail: gmail_v1.Gmail;
  email: ActBodyWithHtml["email"];
  rules: RuleWithActions[];
  allowExecute: boolean;
  forceExecute?: boolean;
  userId: string;
  userEmail: string;
  userAbout: string;
  automated: boolean;
} & UserAIFields;

export async function planOrExecuteAct(options: PlanOrExecuteActOptions) {
  const { rules, email, allowExecute, forceExecute, userId, automated } =
    options;

  if (!rules.length) return;

  const content =
    (email.textHtml && parseEmail(email.textHtml, false, null)) ||
    email.textPlain ||
    email.snippet;

  const plannedAct = await planAct({
    ...options,
    email: {
      ...email,
      content: content || "",
      snippet: email.snippet || "",
    },
  });

  console.log("Planned act:", plannedAct.rule?.name, plannedAct.actionItems);

  // no rule to apply to this thread
  if (!plannedAct.rule) {
    await prisma.executedRule.upsert({
      where: {
        unique_user_thread_message: {
          userId,
          threadId: email.threadId,
          messageId: email.messageId,
        },
      },
      create: {
        threadId: email.threadId,
        messageId: email.messageId,
        automated,
        reason: plannedAct.reason,
        status: ExecutedRuleStatus.SKIPPED,
        user: { connect: { id: userId } },
      },
      update: {
        threadId: email.threadId,
        messageId: email.messageId,
        automated,
        reason: plannedAct.reason,
        status: ExecutedRuleStatus.SKIPPED,
        user: { connect: { id: userId } },
      },
    });

    return plannedAct;
  }

  const shouldExecute =
    allowExecute && (plannedAct.rule.automate || forceExecute);

  console.log("shouldExecute:", shouldExecute);

  const data = {
    actionItems: { createMany: { data: plannedAct.actionItems } },
    messageId: email.messageId,
    threadId: email.threadId,
    automated: plannedAct.rule.automate,
    status: ExecutedRuleStatus.PENDING,
    reason: plannedAct.reason,
    rule: plannedAct.rule.id
      ? { connect: { id: plannedAct.rule.id } }
      : undefined,
    user: { connect: { id: userId } },
  };

  const executedRule = email.messageId
    ? await prisma.executedRule.upsert({
        where: {
          unique_user_thread_message: {
            userId,
            threadId: email.threadId,
            messageId: email.messageId,
          },
        },
        create: data,
        update: data,
      })
    : undefined;

  if (shouldExecute && executedRule) {
    await executeAct({
      ...options,
      actionItems: plannedAct.actionItems,
      email,
      executedRuleId: executedRule.id,
    });
  }

  return plannedAct;
}
