import type { ParsedMessage } from "@/utils/types";
import { internalDateToDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { extractEmailAddress } from "@/utils/email";
import { aiDraftWithKnowledge } from "@/utils/ai/reply/draft-with-knowledge";
import { getReply, saveReply } from "@/utils/redis/reply";
import { getWritingStyle } from "@/utils/user/get";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { aiExtractRelevantKnowledge } from "@/utils/ai/knowledge/extract";
import { stringifyEmail } from "@/utils/stringify-email";
import { aiExtractFromEmailHistory } from "@/utils/ai/knowledge/extract-from-email-history";
import type { EmailProvider } from "@/utils/email/types";
import { aiCollectReplyContext } from "@/utils/ai/reply/reply-context-collector";
import { getOrCreateReferralCode } from "@/utils/referral/referral-code";
import { generateReferralLink } from "@/utils/referral/referral-link";
import { aiGetCalendarAvailability } from "@/utils/ai/calendar/availability";
import { env } from "@/env";
import { mcpAgent } from "@/utils/ai/mcp/mcp-agent";
import {
  getUpcomingMeetingContext,
  formatMeetingContextForPrompt,
} from "@/utils/meeting-briefs/recipient-context";

/**
 * Fetches thread messages and generates draft content in one step
 */
export async function fetchMessagesAndGenerateDraft(
  emailAccount: EmailAccountWithAI,
  threadId: string,
  client: EmailProvider,
  testMessage: ParsedMessage | undefined,
  logger: Logger,
): Promise<string> {
  const { threadMessages, previousConversationMessages } = testMessage
    ? { threadMessages: [testMessage], previousConversationMessages: null }
    : await fetchThreadAndConversationMessages(threadId, client);

  const result = await generateDraftContent(
    emailAccount,
    threadMessages,
    previousConversationMessages,
    client,
    logger,
  );

  if (typeof result !== "string") {
    throw new Error("Draft result is not a string");
  }

  const emailAccountWithSignatures = await prisma.emailAccount.findUnique({
    where: { id: emailAccount.id },
    select: {
      includeReferralSignature: true,
      signature: true,
    },
  });

  let finalResult = result;

  if (
    !env.NEXT_PUBLIC_DISABLE_REFERRAL_SIGNATURE &&
    emailAccountWithSignatures?.includeReferralSignature
  ) {
    const referralSignature = await getOrCreateReferralCode(
      emailAccount.userId,
    );
    const referralLink = generateReferralLink(referralSignature.code);
    const htmlSignature = `Drafted by <a href="${referralLink}">Inbox Zero</a>.`;
    finalResult = `${finalResult}\n\n${htmlSignature}`;
  }

  if (emailAccountWithSignatures?.signature) {
    finalResult = `${finalResult}\n\n${emailAccountWithSignatures.signature}`;
  }

  return finalResult;
}

/**
 * Fetches thread messages and previous conversation messages
 */
async function fetchThreadAndConversationMessages(
  threadId: string,
  client: EmailProvider,
): Promise<{
  threadMessages: ParsedMessage[];
  previousConversationMessages: ParsedMessage[] | null;
}> {
  const threadMessages = await client.getThreadMessages(threadId);
  const previousConversationMessages =
    await client.getPreviousConversationMessages(
      threadMessages.map((msg) => msg.id),
    );

  return {
    threadMessages,
    previousConversationMessages,
  };
}

async function generateDraftContent(
  emailAccount: EmailAccountWithAI,
  threadMessages: ParsedMessage[],
  previousConversationMessages: ParsedMessage[] | null,
  emailProvider: EmailProvider,
  logger: Logger,
) {
  const lastMessage = threadMessages.at(-1);

  if (!lastMessage) throw new Error("No message provided");

  // Check Redis cache for reply
  const reply = await getReply({
    emailAccountId: emailAccount.id,
    messageId: lastMessage.id,
  });

  if (reply) return reply;

  const messages = threadMessages.map((msg, index) => ({
    date: internalDateToDate(msg.internalDate),
    ...getEmailForLLM(msg, {
      // give more context for the message we're processing
      maxLength: index === threadMessages.length - 1 ? 2000 : 500,
      extractReply: true,
      removeForwarded: false,
    }),
  }));

  // 1. Get knowledge base entries
  const knowledgeBase = await prisma.knowledge.findMany({
    where: { emailAccountId: emailAccount.id },
    orderBy: { updatedAt: "desc" },
  });

  // If we have knowledge base entries, extract relevant knowledge and draft with it
  // 2a. Extract relevant knowledge
  const lastMessageContent = stringifyEmail(
    messages[messages.length - 1],
    10_000,
  );
  const [
    knowledgeResult,
    emailHistoryContext,
    calendarAvailability,
    writingStyle,
    mcpResult,
    upcomingMeetings,
  ] = await Promise.all([
    aiExtractRelevantKnowledge({
      knowledgeBase,
      emailContent: lastMessageContent,
      emailAccount,
      logger,
    }),
    aiCollectReplyContext({
      currentThread: messages,
      emailAccount,
      emailProvider,
    }),
    aiGetCalendarAvailability({ emailAccount, messages, logger }),
    getWritingStyle({ emailAccountId: emailAccount.id }),
    mcpAgent({ emailAccount, messages }),
    getUpcomingMeetingContext({
      emailAccountId: emailAccount.id,
      recipientEmail: extractEmailAddress(lastMessage.headers.from),
      logger,
    }),
  ]);

  // 2b. Extract email history context
  const senderEmail = lastMessage.headers.from;

  logger.info("Fetching historical messages from sender", {
    sender: senderEmail,
  });

  // Convert to format needed for aiExtractFromEmailHistory
  const historicalMessagesForLLM = previousConversationMessages?.map((msg) => {
    return getEmailForLLM(msg, {
      maxLength: 1000,
      extractReply: true,
      removeForwarded: false,
    });
  });

  const emailHistorySummary = historicalMessagesForLLM?.length
    ? await aiExtractFromEmailHistory({
        currentThreadMessages: messages,
        historicalMessages: historicalMessagesForLLM,
        emailAccount,
        logger,
      })
    : null;

  // 3. Draft with extracted knowledge
  const meetingContext = formatMeetingContextForPrompt(
    upcomingMeetings,
    emailAccount.timezone,
  );

  const text = await aiDraftWithKnowledge({
    messages,
    emailAccount,
    knowledgeBaseContent: knowledgeResult?.relevantContent || null,
    emailHistorySummary,
    emailHistoryContext,
    calendarAvailability,
    writingStyle,
    mcpContext: mcpResult?.response || null,
    meetingContext,
  });

  if (typeof text === "string") {
    await saveReply({
      emailAccountId: emailAccount.id,
      messageId: lastMessage.id,
      reply: text,
    });
  }

  return text;
}
