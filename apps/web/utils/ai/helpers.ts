import type { Action } from "@/generated/prisma/client";
import { ActionType } from "@/generated/prisma/enums";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { type EmailForLLM, isDefined } from "@/utils/types";

export type RuleActionSummary = Pick<Action, "type"> &
  Partial<Pick<Action, "label" | "folderName">>;

export function getTodayForLLM(date: Date = new Date()) {
  return `Today's date and time is: ${date.toISOString()}.`;
}

export const getUserInfoPrompt = ({
  emailAccount,
  prefix = "The user you are acting on behalf of is:",
}: {
  emailAccount: EmailAccountWithAI & { name?: string | null };
  prefix?: string;
}) => {
  const info = [
    {
      label: "email",
      value: emailAccount.email,
    },
    {
      label: "name",
      value: emailAccount.name,
    },
    {
      label: "about",
      value: emailAccount.about,
    },
  ].filter((i) => i.value);

  return `${prefix || ""}
<user_info>
${info.map((i) => `<${i.label}>${i.value}</${i.label}>`).join("\n")}
</user_info>`.trim();
};

export const getUserRulesPrompt = ({
  rules,
}: {
  rules: {
    name: string;
    instructions: string;
    actions?: RuleActionSummary[];
  }[];
}) => `<user_rules>
${rules
  .map((rule) => {
    const actions = formatRuleActions(rule.actions);
    return `<rule>
  <name>${rule.name}</name>
  <criteria>${rule.instructions}</criteria>${actions ? `\n  <actions>${actions}</actions>` : ""}
</rule>`;
  })
  .join("\n")}
</user_rules>`;

export const getEmailListPrompt = ({
  messages,
  messageMaxLength,
  maxMessages,
}: {
  messages: EmailForLLM[];
  messageMaxLength: number;
  maxMessages?: number;
}) => {
  const messagesToUse = maxMessages ? messages.slice(-maxMessages) : messages;

  return messagesToUse
    .map((email) => `<email>${stringifyEmail(email, messageMaxLength)}</email>`)
    .join("\n");
};

// Only actions that change what the user sees, or that send something on their
// behalf, affect how careful the picker should be. Notifications, digests,
// webhooks, stars, and integrations are left out on purpose.
const ACTION_DESCRIPTIONS: Partial<Record<ActionType, string>> = {
  [ActionType.LABEL]: "label",
  [ActionType.ARCHIVE]: "archive (removes it from the inbox)",
  [ActionType.MOVE_FOLDER]: "move to a folder",
  [ActionType.MARK_READ]: "mark as read",
  [ActionType.MARK_SPAM]: "mark as spam",
  [ActionType.DELETE]: "delete",
  [ActionType.REPLY]: "send a reply",
  [ActionType.SEND_EMAIL]: "send an email",
  [ActionType.FORWARD]: "forward",
};

// Tells the rule picker what a match will do, so it can be more careful with
// rules that hide the email than with rules that only label it.
export function formatRuleActions(actions?: RuleActionSummary[] | null) {
  if (!actions?.length) return "";

  return actions
    .map((action) => {
      if (action.type === ActionType.LABEL && action.label) {
        return `label as "${action.label}"`;
      }
      if (action.type === ActionType.MOVE_FOLDER && action.folderName) {
        return `move to folder "${action.folderName}"`;
      }
      return ACTION_DESCRIPTIONS[action.type];
    })
    .filter(isDefined)
    .join(", ");
}
