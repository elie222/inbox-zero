import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import {
  stringifyEmailFromBody,
  stringifyEmailSimple,
} from "@/utils/stringify-email";
import { preprocessBooleanLike } from "@/utils/zod";

const logger = createScopedLogger("check-if-needs-reply");

const schema = z.object({
  rationale: z
    .string()
    .describe("Brief one-line explanation for the decision."),
  needsReply: z.preprocess(
    preprocessBooleanLike,
    z.boolean().describe("Whether a reply is needed."),
  ),
});
export type AICheckResult = z.infer<typeof schema>;

export async function aiCheckIfNeedsReply({
  emailAccount,
  messageToSend,
  threadContextMessages,
}: {
  emailAccount: EmailAccountWithAI;
  messageToSend: EmailForLLM;
  threadContextMessages: EmailForLLM[];
}): Promise<AICheckResult> {
  // If messageToSend somehow is null/undefined, default to no reply needed.
  if (!messageToSend)
    return { needsReply: false, rationale: "No message provided" };

  const userMessageForPrompt = messageToSend;

  const system = "You are an AI assistant that checks if a reply is needed.";

  const prompt =
    `${emailAccount.about ? `<user_background_information>${emailAccount.about}</user_background_information>` : ""}

We are sending the following message:

<message>
${stringifyEmailSimple(userMessageForPrompt)}
</message>

${
  threadContextMessages.length > 0
    ? `Previous messages in the thread for context:

<previous_messages>
${threadContextMessages
  .map((message) => `<message>${stringifyEmailFromBody(message)}</message>`)
  .join("\n")}
</previous_messages>`
    : ""
}

Decide if the message we are sending needs a reply.
`.trim();

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: emailAccount.user,
    system,
    prompt,
    schema,
    userEmail: emailAccount.email,
    usageLabel: "Check if needs reply",
  });

  logger.trace("Result", { response: aiResponse.object });

  return aiResponse.object as AICheckResult;
}
