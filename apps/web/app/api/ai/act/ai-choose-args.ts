import { UserAIFields } from "@/utils/llms/types";
import { ActionItem } from "@/utils/ai/actions";
import { Action } from "@prisma/client";
import { ActBody } from "@/app/api/ai/act/validation";
import { Function } from "ai";
import { parseJSONWithMultilines } from "@/utils/json";
import { saveAiUsage } from "@/utils/usage";
import { AI_GENERATED_FIELD_VALUE } from "@/utils/config";
import { chatCompletionTools, getAiProviderAndModel } from "@/utils/llms";
import { REQUIRES_MORE_INFO } from "@/app/api/ai/act/consts";

export async function getArgsAiResponse(
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
    [
      {
        type: "function",
        function: {
          name: selectedFunction.name,
          description: "Act on the email using the selected rule.",
          parameters: selectedFunction.parameters,
        },
      },
    ],
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

  const aiGeneratedArgs: Omit<ActionItem, "type"> | undefined =
    functionCall?.arguments
      ? parseJSONWithMultilines(functionCall.arguments)
      : undefined;

  return aiGeneratedArgs;
}

export function getActionItemsFromAiArgsResponse(
  aiArgsResponse: Omit<ActionItem, "type"> | undefined,
  ruleActions: Action[],
) {
  return ruleActions.map(({ type, label, subject, content, to, cc, bcc }) => {
    // use prefilled values where we have them
    return {
      type,
      label: label === AI_GENERATED_FIELD_VALUE ? aiArgsResponse?.label : label,
      subject:
        subject === AI_GENERATED_FIELD_VALUE
          ? aiArgsResponse?.subject
          : subject,
      content:
        content === AI_GENERATED_FIELD_VALUE
          ? aiArgsResponse?.content
          : content,
      to: to === AI_GENERATED_FIELD_VALUE ? aiArgsResponse?.to : to,
      cc: cc === AI_GENERATED_FIELD_VALUE ? aiArgsResponse?.cc : cc,
      bcc: bcc === AI_GENERATED_FIELD_VALUE ? aiArgsResponse?.bcc : bcc,
    };
  });
}
