import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import type { EmailForLLM } from "@/utils/types";

export function getTodayForLLM(date: Date = new Date()) {
  return `Today's date and time is: ${date.toISOString()}.`;
}

export const getUserInfoPrompt = ({
  emailAccount,
}: {
  emailAccount: EmailAccountWithAI & { name?: string | null };
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

  return `<user_info>
${info.map((i) => `<${i.label}>${i.value}</${i.label}>`).join("\n")}
</user_info>`;
};

export const getUserRulesPrompt = ({
  rules,
}: {
  rules: { name: string; instructions: string }[];
}) => {
  return `<user_rules>
${rules
  .map(
    (rule) => `<rule>
  <name>${rule.name}</name>
  <criteria>${rule.instructions}</criteria>
</rule>`,
  )
  .join("\n")}
</user_rules>`;
};

export const getEmailListPrompt = ({
  messages,
  messageMaxLength,
}: {
  messages: EmailForLLM[];
  messageMaxLength: number;
}) => {
  return messages
    .map((email) => `<email>${stringifyEmail(email, messageMaxLength)}</email>`)
    .join("\n");
};
