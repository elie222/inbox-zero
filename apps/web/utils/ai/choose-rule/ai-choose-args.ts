import { UserAIFields } from "@/utils/llms/types";
import { ActionItem } from "@/utils/ai/actions";
import { Action, ActionType, User } from "@prisma/client";
import { Function } from "ai";
import { parseJSONWithMultilines } from "@/utils/json";
import { saveAiUsage } from "@/utils/usage";
import { AI_GENERATED_FIELD_VALUE } from "@/utils/config";
import { chatCompletionTools, getAiProviderAndModel } from "@/utils/llms";
import { REQUIRES_MORE_INFO } from "@/utils/ai/choose-rule/consts";
import {
  EmailForLLM,
  stringifyEmail,
} from "@/utils/ai/choose-rule/stringify-email";

type GetArgsAiResponseOptions = {
  email: EmailForLLM;
  user: Pick<User, "email" | "about"> & UserAIFields;
  selectedRule: { name: string; description: string };
  argsFunction: Function;
};

type AIGeneratedArgs = Record<
  ActionType,
  Record<keyof Omit<ActionItem, "type">, string>
>;

export async function getArgsAiResponse(options: GetArgsAiResponseOptions) {
  const { email, user, selectedRule, argsFunction } = options;

  const messages = [
    {
      role: "system" as const,
      content: `You are an AI assistant that helps people manage their emails.
Never put placeholders in your email responses.
Do not mention you are an AI assistant when responding to people.`,
    },
    ...(user.about
      ? [
          {
            role: "user" as const,
            content: `Some additional information the user has provided about themselves:\n\n${user.about}`,
          },
        ]
      : []),
    {
      role: "user" as const,
      content: `An email was received for processing and a rule was already selected to process it. Handle the email.

The selected rule:
${selectedRule.name} - ${selectedRule.description}

The email the rule will be applied to:
${stringifyEmail(email, 3000)}`,
    },
  ];

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  console.log("Calling chat completion tools");

  const aiResponse = await chatCompletionTools(
    provider,
    model,
    user.openAIApiKey,
    messages,
    [
      {
        type: "function",
        function: argsFunction,
      },
    ],
  );

  if (aiResponse.usage) {
    await saveAiUsage({
      email: user.email || "",
      usage: aiResponse.usage,
      provider: user.aiProvider,
      model,
      label: "Args for rule",
    });
  }

  const functionCall = aiResponse.functionCall;

  if (!functionCall?.name) return;
  if (functionCall.name === REQUIRES_MORE_INFO) return;

  const aiGeneratedArgs: AIGeneratedArgs = functionCall?.arguments
    ? parseJSONWithMultilines(functionCall.arguments)
    : undefined;

  return aiGeneratedArgs;
}

export function getActionItemsFromAiArgsResponse(
  response: AIGeneratedArgs | undefined,
  ruleActions: Action[],
) {
  return ruleActions.map(({ type, label, subject, content, to, cc, bcc }) => {
    // use prefilled values where we have them
    const a = response?.[type] || ({} as any);

    return {
      type,
      label: label === AI_GENERATED_FIELD_VALUE ? a.label : label,
      subject: subject === AI_GENERATED_FIELD_VALUE ? a.subject : subject,
      content: content === AI_GENERATED_FIELD_VALUE ? a.content : content,
      to: to === AI_GENERATED_FIELD_VALUE ? a.to : to,
      cc: cc === AI_GENERATED_FIELD_VALUE ? a.cc : cc,
      bcc: bcc === AI_GENERATED_FIELD_VALUE ? a.bcc : bcc,
    };
  });
}
