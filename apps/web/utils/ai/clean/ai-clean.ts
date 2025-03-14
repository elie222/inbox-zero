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
import { formatDateForLLM } from "@/utils/date";

const logger = createScopedLogger("ai/clean");

// TODO: allow specific labels
// Pass in prompt labels
const schema = z.object({
  archive: z.boolean(),
  // label: z.string().optional(),
  // reasoning: z.string(),
});

export async function aiClean({
  user,
  messages,
  instructions,
  skips,
}: {
  user: Pick<User, "about"> & UserEmailWithAI;
  messages: EmailForLLM[];
  instructions?: string;
  skips: {
    reply?: boolean | null;
    receipt?: boolean | null;
  };
}) {
  const lastMessage = messages.at(-1);

  if (!lastMessage) throw new Error("No messages");

  const system = `You are an AI assistant that is helping a user get to inbox zero.
Your task is to analyze each email and decide on the best action to take:
1. archive - For newsletters, marketing, notifications, or low-priority emails
2. label - For emails that need labelling

For emails that should be labeled, suggest an appropriate label name.
Common labels include: "Finance", "Work", "Personal", "Shopping", "Travel", "Social", etc.`;

  // ${user.about ? `<user_background_information>${user.about}</user_background_information>` : ""}

  const prompt = `
${
  instructions
    ? `Additional user instructions:
<instructions>${instructions}</instructions>`
    : ""
}

${skips.reply ? "Do not archive emails that the user needs to reply to. Social media updates, GitHub issues, LinkedIn messages, Facebook messages, marketing, and newsletters do not need to be replied to." : ""}
${skips.receipt ? "Do not archive emails that are receipts, payments, or invoices." : ""}

The message to analyze:

<message>
${stringifyEmailSimple(lastMessage)}
</message>

Previous messages in the thread for context:

<previous_messages>
${messages
  .slice(-3, -1) // Take 2 messages before the last message
  .map(
    (message) =>
      `<message>${stringifyEmailFromBody(message).slice(0, 500)}</message>`,
  )
  .join("\n")}
</previous_messages>

The current date is ${formatDateForLLM(new Date())}.
`.trim();

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: user,
    system,
    prompt,
    schema,
    userEmail: user.email || "",
    usageLabel: "Clean",
  });

  logger.trace("Result", { response: aiResponse.object });

  return aiResponse.object;
}
