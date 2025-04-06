import { z } from "zod";
import type { User } from "@prisma/client";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import {
  stringifyEmailFromBody,
  stringifyEmailSimple,
} from "@/utils/stringify-email";
import { preprocessBooleanLike } from "@/utils/zod";
const logger = createScopedLogger("check-if-needs-reply");

const schema = z.object({
  needsReply: z.preprocess(preprocessBooleanLike, z.boolean()),
});

export async function aiCheckIfNeedsReply({
  user,
  messages,
}: {
  user: Pick<User, "about"> & UserEmailWithAI;
  messages: EmailForLLM[];
}) {
  const lastMessage = messages.at(-1);

  if (!lastMessage) return { needsReply: false };

  const previousMessages = messages.slice(-3, -1); // Take 2 messages before the last message
  const system = "You are an AI assistant that checks if a reply is needed.";

  const prompt =
    `${user.about ? `<user_background_information>${user.about}</user_background_information>` : ""}

We are sending the following message:

<message>
${stringifyEmailSimple(lastMessage)}
</message>

${
  previousMessages.length > 0
    ? `Previous messages in the thread for context:

<previous_messages>
${previousMessages
  .map((message) => `<message>${stringifyEmailFromBody(message)}</message>`)
  .join("\n")}
</previous_messages>`
    : ""
}

Decide if the message we are sending needs a reply.
`.trim();

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema,
    userEmail: user.email || "",
    usageLabel: "Check if needs reply",
  });

  logger.trace("Result", { response: aiResponse.object });

  return aiResponse.object;
}
