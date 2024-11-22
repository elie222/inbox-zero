import { z } from "zod";
import type { UserAIFields } from "@/utils/llms/types";
import type { ActionItem } from "@/utils/ai/actions";
import type { Action, User } from "@prisma/client";
import { chatCompletionTools } from "@/utils/llms";
import {
  type EmailForLLM,
  stringifyEmail,
} from "@/utils/ai/choose-rule/stringify-email";
import { type RuleWithActions, isDefined } from "@/utils/types";
import { createScopeLogger } from "@/utils/logger";

const logger = createScopeLogger("AI Choose Args");

// Returns parameters for a zod.object for the rule that must be AI generated
function getToolParametersForRule(actions: Action[]) {
  const actionsWithParameters = getActionsWithParameters(actions);

  // handle duplicate keys. e.g. "draft_email" and "draft_email" becomes: "draft_email" and "draft_email_2"
  // this is quite an edge case but need to handle regardless for when it happens
  const typeCount: Record<string, number> = {};
  const parameters: Record<
    string,
    { action: Action; parameters: z.ZodObject<Record<string, z.ZodString>> }
  > = {};

  for (const action of actionsWithParameters) {
    // count how many times we have already had this type
    typeCount[action.type] = (typeCount[action.type] || 0) + 1;
    const key =
      typeCount[action.type] === 1
        ? action.type
        : `${action.type}_${typeCount[action.type]}`;
    parameters[key] = {
      action: action.action,
      parameters: action.parameters,
    };
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
        action,
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
}): Promise<ActionItem[] | undefined> {
  logger.log(
    `Generating args for rule ${selectedRule.name} (${selectedRule.id})`,
  );

  const parameters = getToolParametersForRule(selectedRule.actions);

  if (!Object.keys(parameters).length) {
    logger.log(
      `Skipping. No parameters for rule ${selectedRule.name} (${selectedRule.id})`,
    );
    return;
  }

  const system = `You are an AI assistant that helps people manage their emails.
Never put placeholders in your email responses.
Do not mention you are an AI assistant when responding to people.
${
  user.about
    ? `\nSome additional information the user has provided about themselves:\n\n${user.about}`
    : ""
}`;

  const prompt = `An email was received for processing and the following rule was selected to process it. Handle the email.

<selectedRule>
${selectedRule.instructions}
</selectedRule>

<email>
${stringifyEmail(email, 3000)}
</email>
`;

  logger.log("Calling chat completion tools");

  logger.trace(`System: ${system}`);
  logger.trace(`Prompt: ${prompt}`);

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      apply_rule: {
        description: "Apply the rule with the given arguments",
        parameters: z.object(
          Object.fromEntries(
            Object.entries(parameters).map(([key, { parameters }]) => [
              key,
              parameters,
            ]),
          ),
        ),
      },
    },
    label: "Args for rule",
    userEmail: user.email || "",
  });

  const toolCall = aiResponse.toolCalls[0];

  if (!toolCall?.toolName) return;

  const toolCallArgs = toolCall.args;
  logger.trace(`Tool call args: ${JSON.stringify(toolCallArgs, null, 2)}`);

  const actionItems = Object.entries(parameters).map(([key, { action }]) => {
    const actionItem: ActionItem = {
      type: action.type,
      label: toolCallArgs[key].label || action.label,
      subject: toolCallArgs[key].subject || action.subject,
      content: toolCallArgs[key].content || action.content,
      to: toolCallArgs[key].to || action.to,
      cc: toolCallArgs[key].cc || action.cc,
      bcc: toolCallArgs[key].bcc || action.bcc,
    };
    return actionItem;
  });

  logger.trace(`Action items: ${JSON.stringify(actionItems, null, 2)}`);

  return actionItems;
}
