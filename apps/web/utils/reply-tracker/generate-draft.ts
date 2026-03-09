import type { ParsedMessage } from "@/utils/types";
import { escapeHtml } from "@/utils/string";
import { internalDateToDate, sortByInternalDate } from "@/utils/date";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { extractEmailAddress, extractEmailAddresses } from "@/utils/email";
import { aiDraftReplyWithConfidence } from "@/utils/ai/reply/draft-reply";
import { getReplyWithConfidence, saveReply } from "@/utils/redis/reply";
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
  getMeetingContext,
  formatMeetingContextForPrompt,
} from "@/utils/meeting-briefs/recipient-context";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { meetsDraftReplyConfidenceRequirement } from "@/utils/ai/reply/draft-confidence";

export type DraftGenerationResult = {
  draft: string | null;
  confidence: DraftReplyConfidence;
};

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
  const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
    emailAccount,
    threadId,
    client,
    testMessage,
    logger,
    DraftReplyConfidence.ALL_EMAILS,
  );

  if (result.draft == null) {
    throw new Error("Draft generation did not return content");
  }

  return result.draft;
}

export async function fetchMessagesAndGenerateDraftWithConfidenceThreshold(
  emailAccount: EmailAccountWithAI,
  threadId: string,
  client: EmailProvider,
  testMessage: ParsedMessage | undefined,
  logger: Logger,
  minimumConfidence: DraftReplyConfidence,
): Promise<DraftGenerationResult> {
  const { threadMessages, previousConversationMessages } = testMessage
    ? { threadMessages: [testMessage], previousConversationMessages: null }
    : await fetchThreadAndConversationMessages(threadId, client);

  const { draft, confidence } = await generateDraftContent(
    emailAccount,
    threadMessages,
    previousConversationMessages,
    client,
    logger,
    minimumConfidence,
  );

  if (draft == null) {
    return { draft: null, confidence };
  }

  const emailAccountWithSignatures = await prisma.emailAccount.findUnique({
    where: { id: emailAccount.id },
    select: {
      includeReferralSignature: true,
      signature: true,
    },
  });

  // Escape AI-generated content to prevent prompt injection attacks
  // (e.g., hidden divs with sensitive data that could be leaked)
  // Signatures and other trusted HTML are added AFTER escaping
  let finalResult = escapeHtml(draft);

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

  return { draft: finalResult, confidence };
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
  // Normalize provider-specific ordering (Outlook returns newest-first).
  // Downstream drafting logic expects chronological order (oldest -> newest).
  const threadMessages = (await client.getThreadMessages(threadId)).sort(
    sortByInternalDate("asc"),
  );
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
  minimumConfidence: DraftReplyConfidence,
): Promise<DraftGenerationResult> {
  const lastMessage = threadMessages.at(-1);

  if (!lastMessage) throw new Error("No message provided");

  const cachedReply = await getReplyWithConfidence({
    emailAccountId: emailAccount.id,
    messageId: lastMessage.id,
  });

  if (cachedReply) {
    const meetsThreshold = meetsDraftReplyConfidenceRequirement({
      draftConfidence: cachedReply.confidence,
      minimumConfidence,
    });

    if (meetsThreshold) {
      return { draft: cachedReply.reply, confidence: cachedReply.confidence };
    }

    logger.info("Skipping cached draft due to low confidence", {
      draftConfidence: cachedReply.confidence,
      minimumConfidence,
      threadId: lastMessage.threadId,
      messageId: lastMessage.id,
    });
  }

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
    getMeetingContext({
      emailAccountId: emailAccount.id,
      recipientEmail: extractEmailAddress(lastMessage.headers.from),
      // extract all other recipients (To, CC) for privacy filtering
      // only meetings where ALL recipients were attendees will be included
      additionalRecipients: [
        ...extractEmailAddresses(lastMessage.headers.to),
        ...extractEmailAddresses(lastMessage.headers.cc ?? ""),
      ].filter(
        (email) => email.toLowerCase() !== emailAccount.email.toLowerCase(),
      ),
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

  // 3. Draft reply
  const { reply, confidence } = await aiDraftReplyWithConfidence({
    messages,
    emailAccount,
    knowledgeBaseContent: knowledgeResult?.relevantContent || null,
    emailHistorySummary,
    emailHistoryContext,
    calendarAvailability,
    writingStyle,
    mcpContext: mcpResult?.response || null,
    meetingContext: formatMeetingContextForPrompt(
      upcomingMeetings,
      emailAccount.timezone,
    ),
  });

  if (
    !meetsDraftReplyConfidenceRequirement({
      draftConfidence: confidence,
      minimumConfidence,
    })
  ) {
    logger.info("Skipping draft due to low confidence", {
      draftConfidence: confidence,
      minimumConfidence,
      threadId: lastMessage.threadId,
      messageId: lastMessage.id,
    });

    if (typeof reply === "string") {
      try {
        await saveReply({
          emailAccountId: emailAccount.id,
          messageId: lastMessage.id,
          reply,
          confidence,
        });
      } catch (error) {
        logger.error("Failed to cache low-confidence draft", {
          error,
          messageId: lastMessage.id,
          confidence,
        });
      }
    }

    return { draft: null, confidence };
  }

  if (typeof reply === "string") {
    await saveReply({
      emailAccountId: emailAccount.id,
      messageId: lastMessage.id,
      reply,
      confidence,
    });
  }

  return { draft: reply, confidence };
}
