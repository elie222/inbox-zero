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
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("AI Choose Args");

export type ActionRequiringAi = {
  actionId: string;
  type: string;
  zodParameters: z.ZodObject<Record<string, z.ZodString>>;
};

export type ActionWithAiArgs = ActionRequiringAi & {
  args: Record<string, string>;
};

// Returns the action items with the ai-generated args where needed
export async function getActionItemsWithAiArgs({
  email,
  user,
  selectedRule,
}: {
  email: EmailForLLM;
  user: Pick<User, "email" | "about"> & UserAIFields;
  selectedRule: RuleWithActions;
}): Promise<ActionItem[]> {
  // Get the actions that require ai-generated args
  const actionsRequiringAi = getActionsWithZodParameters(selectedRule.actions);

  // Get the ai-generated args
  let aiGeneratedActionItems: ActionWithAiArgs[] | undefined;
  if (actionsRequiringAi.length) {
    aiGeneratedActionItems = await getArgsAiResponse({
      email,
      user,
      selectedRule,
      actionsRequiringAi,
    });
  }

  // Combine static args with ai-generated args
  const results = selectedRule.actions.map((action) => {
    const aiGeneratedActionItem = aiGeneratedActionItems?.find(
      (item) => item.actionId === action.id,
    );
    return {
      ...action,
      ...aiGeneratedActionItem?.args,
    };
  });

  logger.trace(
    `getActionItemsWithAiArgs. Results: ${JSON.stringify(results, null, 2)}`,
  );

  return results;
}

async function getArgsAiResponse({
  email,
  user,
  selectedRule,
  actionsRequiringAi,
}: {
  email: EmailForLLM;
  user: Pick<User, "email" | "about"> & UserAIFields;
  selectedRule: RuleWithActions;
  actionsRequiringAi: ActionRequiringAi[];
}): Promise<ActionWithAiArgs[] | undefined> {
  logger.info(
    `Generating args for rule ${selectedRule.name} (${selectedRule.id})`,
  );

  if (!actionsRequiringAi.length) {
    logger.info(
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

  const parameters = getToolParametersForRule(actionsRequiringAi);
  const zodParameters = z.object(
    Object.fromEntries(
      Object.entries(parameters).map(([key, { zodParameters }]) => [
        key,
        zodParameters,
      ]),
    ),
  );

  logger.info("Calling chat completion tools");
  logger.trace(`System: ${system}`);
  logger.trace(`Prompt: ${prompt}`);
  // logger.trace("Zod parameters:", zodToJsonSchema(zodParameters));

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      apply_rule: {
        description: "Apply the rule with the given arguments",
        parameters: zodParameters,
      },
    },
    label: "Args for rule",
    userEmail: user.email || "",
  });

  const toolCall = aiResponse.toolCalls[0];

  if (!toolCall?.toolName) return;

  const toolCallArgs = toolCall.args;

  logger.trace(`Tool call args: ${JSON.stringify(toolCallArgs, null, 2)}`);

  const results = actionsRequiringAi.map((actionRequiringAi) => {
    const actionParameter = Object.entries(parameters).find(
      ([_, v]) => v.actionId === actionRequiringAi.actionId,
    );

    if (!actionParameter) return { ...actionRequiringAi, args: {} };

    const [key] = actionParameter; // e.g. key = "draft_email"
    const args: Record<string, string> = toolCallArgs[key]; // e.g. { label: "Draft", subject: "X", content: "Y" }

    return { ...actionRequiringAi, args };
  });

  // const resultsForLogging = results.map(({ zodParameters, ...rest }) => rest);
  // logger.trace(`Results: ${JSON.stringify(resultsForLogging, null, 2)}`);

  return results;
}

// Returns parameters for a zod.object for the rule that must be AI generated
function getToolParametersForRule(actionsRequiringAi: ActionRequiringAi[]) {
  // handle duplicate keys. e.g. "draft_email" and "draft_email" becomes: "draft_email" and "draft_email_2"
  // this is quite an edge case but need to handle regardless for when it happens
  const typeCount: Record<string, number> = {};
  const parameters: Record<
    string,
    {
      actionId: string;
      zodParameters: z.ZodObject<Record<string, z.ZodString>>;
    }
  > = {};

  for (const action of actionsRequiringAi) {
    // count how many times we have already had this type
    typeCount[action.type] = (typeCount[action.type] || 0) + 1;
    const key =
      typeCount[action.type] === 1
        ? action.type
        : `${action.type}_${typeCount[action.type]}`;
    parameters[key] = {
      actionId: action.actionId,
      zodParameters: action.zodParameters,
    };
  }

  return parameters;
}

// Returns the actions with the args that require ai-generation
function getActionsWithZodParameters(actions: Action[]) {
  return actions
    .map((action) => {
      const fields = getParameterFieldsForAction(action);

      if (!Object.keys(fields).length) return;

      const zodParameters = z.object(fields);

      return {
        actionId: action.id,
        type: action.type,
        zodParameters,
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
    fields.label = z.string().describe(labelPrompt || "The email label");
  if (typeof subjectPrompt === "string")
    fields.subject = z.string().describe(subjectPrompt || "The email subject");
  if (typeof contentPrompt === "string")
    fields.content = z.string().describe(contentPrompt || "The email content");
  if (typeof toPrompt === "string")
    fields.to = z.string().describe(toPrompt || "The email recipient(s)");
  if (typeof ccPrompt === "string")
    fields.cc = z.string().describe(ccPrompt || "The cc recipient(s)");
  if (typeof bccPrompt === "string")
    fields.bcc = z.string().describe(bccPrompt || "The bcc recipient(s)");

  return fields;
}
