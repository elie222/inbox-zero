import type { EmailAccountWithAI } from "@/utils/llms/types";

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
