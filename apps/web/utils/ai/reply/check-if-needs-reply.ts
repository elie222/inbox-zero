import { z } from "zod";
import { createGenerateObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import {
  stringifyEmailFromBody,
  stringifyEmailSimple,
} from "@/utils/stringify-email";
import { preprocessBooleanLike } from "@/utils/zod";
import { getModel } from "@/utils/llms/model";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

export async function aiCheckIfNeedsReply({
  emailAccount,
  messageToSend,
  threadContextMessages,
}: {
  emailAccount: EmailAccountWithAI;
  messageToSend: EmailForLLM;
  threadContextMessages: EmailForLLM[];
}) {
  // If messageToSend somehow is null/undefined, default to no reply needed.
  if (!messageToSend)
    return { needsReply: false, rationale: "No message provided" };

  const userMessageForPrompt = messageToSend;

  const system = "You are an AI assistant that checks if a reply is needed.";

  const prompt = `${getUserInfoPrompt({ emailAccount })}

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

Decide if the message we are sending needs a reply. Respond with a JSON object with the following fields:
- rationale: Brief one-line explanation for the decision.
- needsReply: Whether a reply is needed.
`.trim();

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Check if needs reply",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      rationale: z
        .string()
        .describe("Brief one-line explanation for the decision."),
      needsReply: z.preprocess(
        preprocessBooleanLike,
        z.boolean().describe("Whether a reply is needed."),
      ),
    }),
  });

  return aiResponse.object;
}
