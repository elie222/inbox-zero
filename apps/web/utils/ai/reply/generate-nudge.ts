import { chatCompletion } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("generate-nudge");

export async function aiGenerateNudge({
  messages,
  user,
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
  const system = `You are an expert at writing follow-up emails that get responses.
Write a polite and professional email that follows up on the previous conversation.
Keep it concise and friendly. Don't be pushy.
Use context from the previous emails to make it relevant.
Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.
Keep it short.`;

  const prompt = `Here is the context of the email thread (from oldest to newest):
${messages
  .map(
    (msg) => `<email>
${stringifyEmail(msg, 3000)}
<date>${msg.date.toISOString()}</date>
</email>`,
  )
  .join("\n")}
     
Write a brief follow-up email to politely nudge for a response.

Today's date is: ${new Date().toISOString().split("T")[0]}.
IMPORTANT: The person you're writing an email for is: ${messages.at(-1)?.from}.`;

  logger.trace("Input", { system, prompt });

  const response = await chatCompletion({
    userAi: user,
    system,
    prompt,
    userEmail: user.email,
    usageLabel: "Reply",
  });

  logger.trace("Output", { response: response.text });

  return response.text;
}
