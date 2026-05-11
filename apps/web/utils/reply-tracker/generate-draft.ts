import type { ParsedMessage } from "@/utils/types";
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
import { renderEmailTextWithSafeLinks } from "@/utils/email/render-safe-links";
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
import type { DraftAttribution } from "@/utils/ai/reply/draft-attribution";
import { selectDraftAttachmentsForRule } from "@/utils/attachments/draft-attachments";
import type { SelectedAttachment } from "@/utils/attachments/source-schema";
import { getReplyMemoriesForPrompt } from "@/utils/ai/reply/reply-memory";
import type { DraftContextMetadata } from "@/utils/ai/reply/draft-context-metadata";
import { collectSenderReplyExamples } from "@/utils/reply-tracker/sender-reply-examples";

export type DraftGenerationResult = {
  attachments?: SelectedAttachment[];
  draft: string | null;
  confidence: DraftReplyConfidence;
  attribution: DraftAttribution | null;
  draftContextMetadata?: DraftContextMetadata | null;
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
  selectedRuleId?: string,
): Promise<string> {
  const result = await fetchMessagesAndGenerateDraftWithConfidenceThreshold(
    emailAccount,
    threadId,
    client,
    testMessage,
    logger,
    DraftReplyConfidence.ALL_EMAILS,
    selectedRuleId,
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
  selectedRuleId?: string,
): Promise<DraftGenerationResult> {
  const { threadMessages, previousConversationMessages } = testMessage
    ? { threadMessages: [testMessage], previousConversationMessages: null }
    : await fetchThreadAndConversationMessages(threadId, client);

  const { draft, confidence, attribution, attachments, draftContextMetadata } =
    await generateDraftContent(
      emailAccount,
      threadMessages,
      previousConversationMessages,
      client,
      logger,
      minimumConfidence,
      selectedRuleId,
    );

  if (draft == null) {
    return {
      draft: null,
      confidence,
      attribution,
      draftContextMetadata,
      ...(selectedRuleId ? { attachments } : {}),
    };
  }

  const emailAccountWithSignatures = await prisma.emailAccount.findUnique({
    where: { id: emailAccount.id },
    select: {
      allowHiddenAiDraftLinks: true,
      includeReferralSignature: true,
      signature: true,
    },
  });

  // Escape untrusted AI output, but preserve sanitized links so drafts can
  // include clickable URLs without allowing arbitrary HTML rendering.
  let finalResult = renderEmailTextWithSafeLinks(draft, {
    allowHiddenLinks:
      emailAccountWithSignatures?.allowHiddenAiDraftLinks ?? false,
  });

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

  return {
    draft: finalResult,
    confidence,
    attribution,
    draftContextMetadata,
    ...(selectedRuleId ? { attachments } : {}),
  };
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
  selectedRuleId?: string,
): Promise<DraftGenerationResult> {
  const lastMessage = threadMessages.at(-1);

  if (!lastMessage) throw new Error("No message provided");

  const cachedReply = await getReplyWithConfidence({
    emailAccountId: emailAccount.id,
    messageId: lastMessage.id,
    ruleId: selectedRuleId,
  });

  if (cachedReply) {
    const meetsThreshold = meetsDraftReplyConfidenceRequirement({
      draftConfidence: cachedReply.confidence,
      minimumConfidence,
    });

    if (meetsThreshold) {
      return {
        draft: cachedReply.reply,
        confidence: cachedReply.confidence,
        attribution: cachedReply.attribution,
        draftContextMetadata: cachedReply.draftContextMetadata,
        ...(selectedRuleId ? { attachments: cachedReply.attachments } : {}),
      };
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
  const currentMessageIds = new Set(threadMessages.map((msg) => msg.id));
  const historicalMessagesForLLM = previousConversationMessages
    ?.filter((msg) => !currentMessageIds.has(msg.id))
    .map((msg) =>
      getEmailForLLM(msg, {
        maxLength: 1000,
        extractReply: true,
        removeForwarded: false,
      }),
    );
  const senderEmail = extractEmailAddress(lastMessage.headers.from);

  if (historicalMessagesForLLM?.length) {
    logger.info("Fetching historical messages from sender");
    logger.trace("Fetching historical messages from sender", {
      sender: lastMessage.headers.from,
    });
  }
  const attachmentSelectionPromise = selectedRuleId
    ? selectDraftAttachmentsForRule({
        emailAccount,
        ruleId: selectedRuleId,
        emailContent: lastMessageContent,
        logger,
      }).catch((error) => {
        logger.error("Failed to select draft attachments", {
          error,
          ruleId: selectedRuleId,
        });
        return {
          selectedAttachments: [],
          attachmentContext: null,
        };
      })
    : Promise.resolve({
        selectedAttachments: [],
        attachmentContext: null,
      });
  const [
    knowledgeResult,
    replyMemorySelection,
    emailHistoryContext,
    calendarAvailability,
    writingStyle,
    emailAccountSettings,
    mcpResult,
    upcomingMeetings,
    emailHistorySummary,
    attachmentSelection,
    activeBookingLinks,
    senderReplyExamples,
  ] = await Promise.all([
    aiExtractRelevantKnowledge({
      knowledgeBase,
      emailContent: lastMessageContent,
      emailAccount,
      logger,
    }),
    getReplyMemoriesForPrompt({
      emailAccountId: emailAccount.id,
      senderEmail,
      emailContent: lastMessageContent,
      logger,
    }),
    aiCollectReplyContext({
      currentThread: messages,
      emailAccount,
      emailProvider,
    }),
    aiGetCalendarAvailability({ emailAccount, messages, logger }),
    getWritingStyle({ emailAccountId: emailAccount.id }),
    prisma.emailAccount.findUnique({
      where: { id: emailAccount.id },
      select: { learnedWritingStyle: true, signature: true },
    }),
    mcpAgent({ emailAccount, messages }),
    getMeetingContext({
      emailAccountId: emailAccount.id,
      recipientEmail: senderEmail,
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
    historicalMessagesForLLM?.length
      ? aiExtractFromEmailHistory({
          currentThreadMessages: messages,
          historicalMessages: historicalMessagesForLLM,
          emailAccount,
          logger,
        })
      : Promise.resolve(null),
    attachmentSelectionPromise,
    prisma.bookingLink.findMany({
      where: { emailAccountId: emailAccount.id, isActive: true },
      orderBy: { createdAt: "desc" },
      take: 1,
      select: { slug: true },
    }),
    collectSenderReplyExamples({
      emailAccount,
      emailProvider,
      senderEmail,
      currentMessageIds,
      logger,
    }),
  ]);
  const {
    content: replyMemoryContent,
    selectedMemories: selectedReplyMemories,
  } = replyMemorySelection;
  const meetingContext = formatMeetingContextForPrompt(
    upcomingMeetings,
    emailAccount.timezone,
  );
  const precedentThreadCount = emailHistoryContext?.relevantEmails.length ?? 0;
  const draftContextMetadata: DraftContextMetadata = {
    replyMemories: {
      count: selectedReplyMemories.length,
      ids: selectedReplyMemories.map((m) => m.id),
      kinds: [...new Set(selectedReplyMemories.map((m) => m.kind))],
      scopeTypes: [...new Set(selectedReplyMemories.map((m) => m.scopeType))],
    },
    knowledgeBase: {
      availableCount: knowledgeBase.length,
      injected: !!knowledgeResult?.relevantContent?.trim(),
    },
    senderHistory: {
      summaryInjected: !!emailHistorySummary,
      summarySourceMessageCount: historicalMessagesForLLM?.length ?? 0,
      precedentThreadsInjected: precedentThreadCount > 0,
      precedentThreadCount,
      sameSenderReplyExamplesInjected: !!senderReplyExamples?.content,
      sameSenderReplyExampleCount: senderReplyExamples?.count ?? 0,
    },
    calendar: {
      injected: !!calendarAvailability,
      noAvailability: calendarAvailability?.noAvailability ?? false,
      suggestedTimesCount: calendarAvailability?.suggestedTimes?.length ?? 0,
    },
    writingStyle: { custom: !!writingStyle },
    externalTools: { injected: !!mcpResult?.response },
    meetings: { injected: !!meetingContext, count: upcomingMeetings.length },
    attachments: {
      injected: !!attachmentSelection.attachmentContext,
      selectedCount: attachmentSelection.selectedAttachments.length,
    },
  };

  if (selectedReplyMemories.length) {
    logger.info("Injecting reply memories into draft prompt", {
      replyMemoryCount: selectedReplyMemories.length,
      replyMemoryIds: selectedReplyMemories.map((memory) => memory.id),
      replyMemoryKinds: [
        ...new Set(selectedReplyMemories.map((memory) => memory.kind)),
      ],
      replyMemoryScopeTypes: [
        ...new Set(selectedReplyMemories.map((memory) => memory.scopeType)),
      ],
    });
  }

  // 3. Draft reply
  const { reply, confidence, attribution } = await aiDraftReplyWithConfidence({
    messages,
    emailAccount: { ...emailAccount, bookingLinks: activeBookingLinks },
    knowledgeBaseContent: knowledgeResult?.relevantContent || null,
    replyMemoryContent,
    emailHistorySummary,
    emailHistoryContext,
    senderReplyExamples: senderReplyExamples?.content ?? null,
    calendarAvailability,
    writingStyle,
    learnedWritingStyle: emailAccountSettings?.learnedWritingStyle ?? null,
    hasConfiguredSignature: !!emailAccountSettings?.signature?.trim(),
    mcpContext: mcpResult?.response || null,
    meetingContext,
    attachmentContext: attachmentSelection.attachmentContext,
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

    try {
      await saveReply({
        emailAccountId: emailAccount.id,
        messageId: lastMessage.id,
        reply,
        confidence,
        attribution,
        draftContextMetadata,
        ...(selectedRuleId
          ? {
              attachments: attachmentSelection.selectedAttachments,
              ruleId: selectedRuleId,
            }
          : {}),
      });
    } catch (error) {
      logger.error("Failed to cache low-confidence draft", {
        error,
        messageId: lastMessage.id,
        confidence,
      });
    }

    return {
      draft: null,
      confidence,
      attribution,
      draftContextMetadata,
      ...(selectedRuleId
        ? { attachments: attachmentSelection.selectedAttachments }
        : {}),
    };
  }

  try {
    await saveReply({
      emailAccountId: emailAccount.id,
      messageId: lastMessage.id,
      reply,
      confidence,
      attribution,
      draftContextMetadata,
      ...(selectedRuleId
        ? {
            attachments: attachmentSelection.selectedAttachments,
            ruleId: selectedRuleId,
          }
        : {}),
    });
  } catch (error) {
    logger.error("Failed to cache draft", {
      error,
      messageId: lastMessage.id,
      confidence,
    });
  }

  return {
    draft: reply,
    confidence,
    attribution,
    draftContextMetadata,
    ...(selectedRuleId
      ? { attachments: attachmentSelection.selectedAttachments }
      : {}),
  };
}
