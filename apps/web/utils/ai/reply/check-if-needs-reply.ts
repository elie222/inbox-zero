import { z } from "zod";
import type { User } from "@prisma/client";
import { chatCompletionObject } from "@/utils/llms";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import { stringifyEmail } from "@/utils/ai/choose-rule/stringify-email";

const logger = createScopedLogger("check-if-needs-reply");

const schema = z.object({ needsReply: z.boolean() });

export async function aiCheckIfNeedsReply({
  user,
  messages,
}: {
  user: Pick<User, "id" | "about"> & UserEmailWithAI;
  messages: EmailForLLM[];
}) {
  const system = `You are an AI assistant that checks if a reply is needed.
`;

  const prompt = `${user.about ? `<user_background_information>${user.about}</user_background_information>` : ""}

<thread>
${messages
  .slice(-5)
  .map((message) => `<message>${stringifyEmail(message, 500)}</message>`)
  .join("\n")}
</thread>
`;

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
