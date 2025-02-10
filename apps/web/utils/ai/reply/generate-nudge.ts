import { chatCompletionStream } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("generate-nudge");

export async function aiGenerateNudge({
  messages,
  user,
  onFinish,
}: {
  messages: {
    from: string;
    to: string;
    subject: string;
    content: string;
    date: Date;
  }[];
  user: UserEmailWithAI;
  onFinish?: (completion: string) => Promise<void>;
}) {
  const system = `You are an AI assistant helping to write a follow-up email to nudge someone who hasn't responded.
Write a polite and professional email that follows up on the previous conversation.
Keep it concise and friendly. Don't be pushy.
Use context from the previous emails to make it relevant.
Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.`;

  const prompt = `Here is the context of the email thread (from oldest to newest):
${messages
  .map(
    (msg) => `<email>
${stringifyEmail(msg, 3000)}
<date>${msg.date.toISOString()}</date>
</email>`,
  )
  .join("\n")}
     
Please write a follow-up email to nudge for a response.`;

  logger.trace("Input", { system, prompt });

  const response = await chatCompletionStream({
    userAi: user,
    system,
    prompt,
    userEmail: user.email,
    usageLabel: "Reply",
    onFinish: async (completion) => {
      logger.trace("Output", { completion });
      if (onFinish) await onFinish(completion);
    },
  });

  return response.toDataStreamResponse();
}
