import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import { getModel } from "@/utils/llms/model";
import type { EmailProvider } from "@/utils/email/types";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import { PROMPT_SECURITY_INSTRUCTIONS } from "@/utils/ai/security";

const MAX_INBOX_MESSAGES_FOR_PROMPT = 8;

const automationMessageSchema = z.object({
  message: z.string().trim().min(1),
});

export type AutomationCheckInEmailAccount = Pick<
  EmailAccountWithAI,
  "id" | "userId" | "email" | "about" | "user"
> & {
  name: string | null;
};

export async function aiGenerateAutomationCheckInMessage({
  prompt,
  emailProvider,
  emailAccount,
}: {
  prompt: string;
  emailProvider: EmailProvider;
  emailAccount: AutomationCheckInEmailAccount;
}) {
  const [stats, inboxMessages] = await Promise.all([
    emailProvider.getInboxStats(),
    emailProvider.getInboxMessages(MAX_INBOX_MESSAGES_FOR_PROMPT),
  ]);

  const modelOptions = getModel(emailAccount.user, "economy");
  const generateObject = createGenerateObject({
    emailAccount,
    label: "Automation check-in message",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system: `You generate concise Slack check-in messages about the user's inbox.

${PROMPT_SECURITY_INSTRUCTIONS}

Follow the user's custom instructions while prioritizing the most actionable and important emails.
Return plain text only and keep the message short.`,
    prompt: buildAutomationPrompt({
      prompt,
      unreadCount: stats.unread,
      totalInboxCount: stats.total,
      inboxMessages: inboxMessages.slice(0, MAX_INBOX_MESSAGES_FOR_PROMPT),
      emailAccount,
    }),
    schema: automationMessageSchema,
  });

  return aiResponse.object.message;
}

function buildAutomationPrompt({
  prompt,
  unreadCount,
  totalInboxCount,
  inboxMessages,
  emailAccount,
}: {
  prompt: string;
  unreadCount: number;
  totalInboxCount: number;
  inboxMessages: Awaited<ReturnType<EmailProvider["getInboxMessages"]>>;
  emailAccount: AutomationCheckInEmailAccount;
}) {
  const recentEmailsText = inboxMessages.length
    ? inboxMessages
        .map((message) => {
          const email = getEmailForLLM(message, {
            maxLength: 600,
            removeForwarded: true,
          });
          const receivedAt = email.date
            ? `<received_at>${email.date.toISOString()}</received_at>`
            : "";

          return `<email>
${receivedAt}
${stringifyEmailSimple(email)}
</email>`;
        })
        .join("\n")
    : "<email_list_empty>true</email_list_empty>";

  const userContext = [
    `<email>${emailAccount.email}</email>`,
    emailAccount.name ? `<name>${emailAccount.name}</name>` : "",
    emailAccount.about ? `<about>${emailAccount.about}</about>` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `
<custom_instructions>
${prompt}
</custom_instructions>

<inbox_stats>
  <unread>${unreadCount}</unread>
  <total>${totalInboxCount}</total>
</inbox_stats>

<recent_inbox_messages>
${recentEmailsText}
</recent_inbox_messages>

<user_context>
${userContext}
</user_context>

Write one proactive Slack check-in message that:
- follows the custom instructions,
- references the inbox context above,
- is at most 3 short sentences,
- ends with a clear action question,
- uses plain text only (no markdown bullets).
`.trim();
}
