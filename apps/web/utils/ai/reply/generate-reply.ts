import { chatCompletion } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { getTodayForLLM } from "@/utils/llms/helpers";

const logger = createScopedLogger("generate-reply");

export async function aiGenerateReply({
  messages,
  user,
  instructions,
}: {
  messages: (EmailForLLM & { to: string })[];
  user: UserEmailWithAI;
  instructions: string | null;
}) {
  const system = `You are an expert assistant that drafts email replies.
Write a polite and professional email that follows up on the previous conversation.
Keep it concise and friendly. Don't be pushy.
Use context from the previous emails to make it relevant.
Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.
Keep it short.

IMPORTANT: Use placeholders sparingly! Only use them where you have limited information.
Never use placeholders for the user's name. You do not need to sign off with the user's name. Do not add a signature.
Do not invent information. For example, DO NOT offer to meet someone at a specific time as you don't know what time the user is available.`;

  const userInstructions = instructions
    ? `Additional user instructions:

<instructions>
${instructions}
</instructions>
`
    : "";

  const userAbout = user.about
    ? `Context about the user:
    
<userAbout>
${user.about}
</userAbout>
`
    : "";

  const prompt = `${userInstructions}
${userAbout}

Here is the context of the email thread (from oldest to newest):
${messages
  .map(
    (msg) => `<email>
${stringifyEmail(msg, 3000)}
</email>`,
  )
  .join("\n")}
     
Please write a reply to the email.
${getTodayForLLM()}
IMPORTANT: The person you're writing an email for is: ${messages.at(-1)?.to}.`.trim();

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
