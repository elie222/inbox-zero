import { z } from "zod";
import type { UserAIFields } from "@/utils/llms/types";
import type { ActionItem } from "@/utils/ai/actions";
import type { Action, ActionType, User } from "@prisma/client";
import { parseJSONWithMultilines } from "@/utils/json";
import { saveAiUsage } from "@/utils/usage";
import { chatCompletionTools, getAiProviderAndModel } from "@/utils/llms";
import {
  type EmailForLLM,
  stringifyEmail,
} from "@/utils/ai/choose-rule/stringify-email";
import { type RuleWithActions, isDefined } from "@/utils/types";

type AIGeneratedArgs = Record<
  ActionType,
  Record<keyof Omit<ActionItem, "type">, string>
>;

// Returns parameters for a zod.object for the rule that must be AI generated
function getToolParametersForRule(actions: Action[]) {
  const actionsWithParameters = getActionsWithParameters(actions);

  // handle duplicate keys. eg. "draft_email" and "draft_email" becomes: "draft_email" and "draft_email_2"
  // this is quite an edge case but need to handle regardless for when it happens
  const typeCount: Record<string, number> = {};
  const parameters: Record<string, z.ZodObject<any>> = {};

  for (const action of actionsWithParameters) {
    if (parameters[action.type]) {
      // count how many times we have already had this type
      typeCount[action.type] = (typeCount[action.type] || 0) + 1;
      parameters[
        typeCount[action.type] === 1
          ? action.type
          : `${action.type}_${typeCount[action.type]}`
      ] = action.parameters;
    }
  }

  return parameters;
}

export function getActionsWithParameters(actions: Action[]) {
  return actions
    .map((action) => {
      const fields = getParameterFieldsForAction(action);

      if (!Object.keys(fields).length) return;

      const parameters = z.object(fields);

      return {
        type: action.type,
        parameters,
      };
    })
    .filter(isDefined);
}

function getParameterFieldsForAction({
  labelPrompt,
  subjectPrompt,
  contentPrompt,
  toPrompt,
  ccPrompt,
  bccPrompt,
}: Action) {
  const fields: Record<string, z.ZodString> = {};

  if (typeof labelPrompt === "string")
    fields.label = z.string().describe("The email label");
  if (typeof subjectPrompt === "string")
    fields.subject = z.string().describe("The email subject");
  if (typeof contentPrompt === "string")
    fields.content = z.string().describe("The email content");
  if (typeof toPrompt === "string")
    fields.to = z.string().describe("The email recipient(s)");
  if (typeof ccPrompt === "string")
    fields.cc = z.string().describe("The cc recipient(s)");
  if (typeof bccPrompt === "string")
    fields.bcc = z.string().describe("The bcc recipient(s)");

  return fields;
}

export async function getArgsAiResponse({
  email,
  user,
  selectedRule,
}: {
  email: EmailForLLM;
  user: Pick<User, "email" | "about"> & UserAIFields;
  selectedRule: RuleWithActions;
}) {
  const parameters = getToolParametersForRule(selectedRule.actions);

  if (!Object.keys(parameters).length) return;

  const system = `You are an AI assistant that helps people manage their emails.
Never put placeholders in your email responses.
Do not mention you are an AI assistant when responding to people.

Some additional information the user has provided about themselves:\n\n${user.about}`;

  const prompt = `An email was received for processing and a rule was already selected to process it. Handle the email.

The selected rule:
${selectedRule.name} - ${selectedRule.instructions}

The email the rule will be applied to:
${stringifyEmail(email, 3000)}`;

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );

  console.log("Calling chat completion tools");

  const aiResponse = await chatCompletionTools({
    provider,
    model,
    apiKey: user.openAIApiKey,
    prompt,
    system,
    tools: {
      generate_fields: {
        description: `Generate the arguments for the rule`,
        parameters: z.object(parameters),
      },
    },
  });

  if (aiResponse.usage) {
    await saveAiUsage({
      email: user.email || "",
      usage: aiResponse.usage,
      provider: user.aiProvider,
      model,
      label: "Args for rule",
    });
  }

  const functionCall = aiResponse.toolCalls[0];

  if (!functionCall) return;
  if (!functionCall.toolName) return;

  const aiGeneratedArgs: AIGeneratedArgs = functionCall.args
    ? parseJSONWithMultilines(functionCall.args)
    : undefined;

  return aiGeneratedArgs;
}

export function getActionItemsFromAiArgsResponse(
  response: AIGeneratedArgs | undefined,
  ruleActions: Action[],
) {
  return ruleActions.map((ra) => {
    // use prefilled values where we have them
    const a = response?.[ra.type] || ({} as any);

    return {
      type: ra.type,
      label: ra.labelPrompt ? a.label : ra.label,
      subject: ra.subjectPrompt ? a.subject : ra.subject,
      content: ra.contentPrompt ? a.content : ra.content,
      to: ra.toPrompt ? a.to : ra.to,
      cc: ra.ccPrompt ? a.cc : ra.cc,
      bcc: ra.bccPrompt ? a.bcc : ra.bcc,
    };
  });
}
