import { createGenerateText } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";

export async function aiGenerateNudge({
  messages,
  emailAccount,
}: {
  messages: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
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
${getEmailListPrompt({ messages, messageMaxLength: 3000 })}
     
Write a brief follow-up email to politely nudge for a response.

${getTodayForLLM()}
IMPORTANT: The person you're writing an email for is: ${messages.at(-1)?.from}.`;

  const modelOptions = getModel(emailAccount.user, "chat");

  const generateText = createGenerateText({
    label: "Reply",
    userEmail: emailAccount.email,
    modelOptions,
  });

  const response = await generateText({
    ...modelOptions,
    system,
    prompt,
  });

  return response.text;
}
