import type { Action } from "@/generated/prisma/client";
import { ActionType } from "@/generated/prisma/enums";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import type { EmailForLLM } from "@/utils/types";

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

const ACTION_DESCRIPTIONS: Record<ActionType, string> = {
  [ActionType.ARCHIVE]: "archive (removes it from the inbox)",
  [ActionType.LABEL]: "label",
  [ActionType.REPLY]: "send a reply",
  [ActionType.SEND_EMAIL]: "send an email",
  [ActionType.FORWARD]: "forward",
  [ActionType.DRAFT_EMAIL]: "draft a reply",
  [ActionType.DRAFT_MESSAGING_CHANNEL]: "draft a reply in chat",
  [ActionType.NOTIFY_MESSAGING_CHANNEL]: "send a chat notification",
  [ActionType.MARK_SPAM]: "mark as spam",
  [ActionType.CALL_WEBHOOK]: "call a webhook",
  [ActionType.MARK_READ]: "mark as read",
  [ActionType.STAR]: "star",
  [ActionType.DELETE]: "delete",
  [ActionType.DIGEST]: "add to the digest",
  [ActionType.MOVE_FOLDER]: "move to a folder",
  [ActionType.NOTIFY_SENDER]: "notify the sender",
  [ActionType.INTEGRATION]: "run an integration action",
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
    .join(", ");
}
