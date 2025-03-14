import type { gmail_v1 } from "@googleapis/gmail";
import type { ParsedMessage } from "@/utils/types";
import { internalDateToDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { draftEmail } from "@/utils/gmail/mail";
import { aiGenerateReply } from "@/utils/ai/reply/generate-reply";
import { getReply, saveReply } from "@/utils/redis/reply";
import { getAiUser } from "@/utils/user/get";
import { getThreadMessages } from "@/utils/gmail/thread";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import { getReplyTrackingRule } from "@/utils/reply-tracker";

export async function generateDraft({
  userId,
  userEmail,
  gmail,
  message,
}: {
  userId: string;
  userEmail: string;
  gmail: gmail_v1.Gmail;
  message: ParsedMessage;
}) {
  const logger = createScopedLogger("generate-reply").with({
    email: userEmail,
    userId,
    messageId: message.id,
    threadId: message.threadId,
  });

  const replyTrackingRule = await getReplyTrackingRule(userId);

  if (!replyTrackingRule?.draftReplies) return;

  logger.info("Generating draft");

  const user = await getAiUser({ id: userId });
  if (!user) throw new Error("User not found");

  const messages = await getThreadMessages(message.threadId, gmail);

  // 1. Draft with AI
  const result = await generateContent(
    user,
    messages,
    replyTrackingRule.draftRepliesInstructions,
  );

  logger.info("Draft generated", { result });

  // 2. Create Gmail draft
  await draftEmail(gmail, message, { content: result });

  logger.info("Draft created");
}

async function generateContent(
  user: UserEmailWithAI,
  threadMessages: ParsedMessage[],
  instructions: string | null,
) {
  const lastMessage = threadMessages.at(-1);

  if (!lastMessage) throw new Error("No message provided");

  const reply = await getReply({ userId: user.id, messageId: lastMessage.id });

  if (reply) return reply;

  const messages = threadMessages.map((msg, index) => ({
    to: msg.headers.to,
    date: internalDateToDate(msg.internalDate),
    ...getEmailForLLM(msg, {
      // give more context for the message we're processing
      maxLength: index === threadMessages.length - 1 ? 2000 : 500,
      extractReply: true,
      removeForwarded: false,
    }),
  }));

  const text = await aiGenerateReply({
    messages,
    user,
    instructions,
  });

  await saveReply({
    userId: user.id,
    messageId: lastMessage.id,
    reply: text,
  });

  return text;
}
