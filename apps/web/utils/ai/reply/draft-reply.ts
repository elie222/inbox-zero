import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateObject } from "@/utils/llms/index";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";
import type { ReplyContextCollectorResult } from "@/utils/ai/reply/reply-context-collector";
import type { CalendarAvailabilityContext } from "@/utils/ai/calendar/availability";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { normalizeDraftReplyConfidence } from "@/utils/ai/reply/draft-confidence";
import {
  createDraftAttributionTracker,
  type DraftAttribution,
} from "@/utils/ai/reply/draft-attribution";

const logger = createScopedLogger("DraftReply");
const DRAFT_OUTPUT_INSTRUCTION =
  "Return plain text only. Do not use HTML tags. If a clickable link is necessary, use markdown links in the format [Label](https://example.com/path) or [Label](mailto:name@example.com).";

const systemPrompt = `You are an expert assistant that drafts email replies.

Use context from the previous emails and the provided knowledge base to make it relevant and accurate.
IMPORTANT: Do NOT simply repeat or mirror what the last email said. It doesn't add anything to the conversation to repeat back to them what they just said.
Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.
${DRAFT_OUTPUT_INSTRUCTION}
IMPORTANT: Format paragraphs using Unix newlines: use "\n\n" between paragraphs and "\n" for single line breaks.
Write the reply in the same language as the latest message in the thread.

IMPORTANT: Use placeholders sparingly! Only use them where you have limited information.
Never use placeholders for the user's name. You do not need to sign off with the user's name. Do not add a signature.
Do not invent information.
Do not use em dashes unless the provided writing style explicitly calls for them.
Don't suggest meeting times or mention availability unless specific calendar information is provided.

Write an email that follows up on the previous conversation.
Your reply should aim to continue the conversation or provide new information based on the context or knowledge base. If you have nothing substantial to add, keep the reply minimal.
`;

const defaultWritingStyle = `Keep it concise, direct, and friendly.
Keep the reply short. Aim for 2 sentences at most unless a brief answer to multiple questions needs more.
Don't be pushy.
Write in a plainspoken, professional tone.
Prefer short declarative sentences over polished or overly elaborate phrasing.`;

const getUserPrompt = ({
  messages,
  emailAccount,
  knowledgeBaseContent,
  replyMemoryContent,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  learnedWritingStyle,
  mcpContext,
  meetingContext,
  attachmentContext,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  replyMemoryContent: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  learnedWritingStyle: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
  attachmentContext: string | null;
}) => {
  const userAbout = emailAccount.about
    ? `Context about the user:

<userAbout>
${emailAccount.about}
</userAbout>
`
    : "";

  const relevantKnowledge = knowledgeBaseContent
    ? `Relevant knowledge base content:

<knowledge_base>
${knowledgeBaseContent}
</knowledge_base>
`
    : "";

  const learnedReplyMemories = replyMemoryContent
    ? `Learned reply memories from prior draft edits. These are advisory, not mandatory. Use them only when they clearly help with the current email, and ignore any memory that does not fit. Explicit user instructions and knowledge base content take precedence.

<reply_memories>
${replyMemoryContent}
</reply_memories>
`
    : "";

  const historicalContext = emailHistorySummary
    ? `Historical email context with this sender:

<sender_history>
${emailHistorySummary}
</sender_history>
`
    : "";

  const precedentHistoryContext = emailHistoryContext?.relevantEmails.length
    ? `Information from similar email threads that may be relevant to the current conversation to draft a reply.

<email_history>
${emailHistoryContext.relevantEmails
  .map(
    (item) => `<item>
${item}
</item>`,
  )
  .join("\n")}
</email_history>

<email_history_notes>
${emailHistoryContext.notes || "No notes"}
</email_history_notes>
`
    : "";

  const writingStylePrompt = writingStyle
    ? `Writing style:

<writing_style>
${writingStyle}
</writing_style>
`
    : "";

  const learnedWritingStylePrompt = learnedWritingStyle
    ? `Learned writing style from prior draft edits. This is advisory and lower priority than any explicit writing style provided by the user.

<learned_writing_style>
${learnedWritingStyle}
</learned_writing_style>
`
    : "";

  const schedulingContext = getSchedulingContext({
    calendarBookingLink: emailAccount.calendarBookingLink,
    calendarAvailability,
  });

  const mcpToolsContext = mcpContext
    ? `Additional context fetched from external tools (such as CRM systems, task managers, or other integrations) that may help draft a response:

<external_tools_context>
${mcpContext}
</external_tools_context>
`
    : "";

  const upcomingMeetingsContext = meetingContext || "";
  const selectedAttachments = attachmentContext
    ? `Selected PDF attachments that will be included with this draft:

<selected_attachments>
${attachmentContext}
</selected_attachments>

Mention attached documents only when useful and only if this section is present.
`
    : "";

  return `${userAbout}
${relevantKnowledge}
${learnedReplyMemories}
${historicalContext}
${precedentHistoryContext}
${writingStylePrompt}
${learnedWritingStylePrompt}
${schedulingContext}
${mcpToolsContext}
${upcomingMeetingsContext}
${selectedAttachments}

Here is the context of the email thread (from oldest to newest):
${getEmailListPrompt({ messages, messageMaxLength: 3000 })}

Please write a reply to the email.
${getTodayForLLM()}
IMPORTANT: You are writing an email as ${emailAccount.email}. Write the reply from their perspective.`;
};

const draftSchema = z.object({
  reply: z
    .string()
    .describe(
      "The complete email reply draft incorporating knowledge base information",
    ),
  confidence: z
    .nativeEnum(DraftReplyConfidence)
    .describe(
      "Required value: ALL_EMAILS, STANDARD, or HIGH_CONFIDENCE. Use ALL_EMAILS when uncertain, context is missing, or the draft must ask/check/follow up because requested facts are unavailable. Use STANDARD for solid drafts with minor uncertainty. Use HIGH_CONFIDENCE only when the sender's intent and the complete factual response are clear from the provided context.",
    ),
});

export type DraftReplyResult = {
  reply: string;
  confidence: DraftReplyConfidence;
  attribution: DraftAttribution | null;
};

export async function aiDraftReplyWithConfidence({
  messages,
  emailAccount,
  knowledgeBaseContent,
  replyMemoryContent = null,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  learnedWritingStyle = null,
  mcpContext,
  meetingContext,
  attachmentContext = null,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  replyMemoryContent?: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  learnedWritingStyle?: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
  attachmentContext?: string | null;
}): Promise<DraftReplyResult> {
  logger.info("Drafting email reply", {
    messageCount: messages.length,
    hasKnowledge: !!knowledgeBaseContent,
    hasHistory: !!emailHistorySummary,
    calendarAvailability: calendarAvailability
      ? {
          noAvailability: calendarAvailability.noAvailability,
          suggestedTimesCount: calendarAvailability.suggestedTimes?.length || 0,
        }
      : null,
  });

  const normalizedWritingStyle = writingStyle?.trim() || null;
  const normalizedLearnedWritingStyle = learnedWritingStyle?.trim() || null;
  const effectiveWritingStyle =
    normalizedWritingStyle ||
    normalizedLearnedWritingStyle ||
    defaultWritingStyle;
  const advisoryLearnedWritingStyle = normalizedWritingStyle
    ? normalizedLearnedWritingStyle
    : null;

  const prompt = getUserPrompt({
    messages,
    emailAccount,
    knowledgeBaseContent,
    replyMemoryContent,
    emailHistorySummary,
    emailHistoryContext,
    calendarAvailability,
    writingStyle: effectiveWritingStyle,
    learnedWritingStyle: advisoryLearnedWritingStyle,
    mcpContext,
    meetingContext,
    attachmentContext,
  });

  const modelOptions = getModel(emailAccount.user, "draft");
  const attributionTracker = createDraftAttributionTracker();

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Draft reply",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
    onModelUsed: attributionTracker.onModelUsed,
  });

  const generate = () =>
    generateObject({
      ...modelOptions,
      system: systemPrompt,
      prompt,
      schema: draftSchema,
    });

  let result = await generate();

  if (REPETITIVE_TEXT_PATTERN.test(result.object.reply)) {
    logger.warn("Draft reply rejected: repetitive output detected, retrying");
    result = await generate();

    if (REPETITIVE_TEXT_PATTERN.test(result.object.reply)) {
      logger.warn("Draft reply rejected: repetitive output on retry");
      throw new Error("Draft reply generation produced invalid output");
    }
  }

  return {
    reply: normalizeDraftReplyFormatting(result.object.reply),
    confidence: normalizeDraftReplyConfidence(result.object.confidence),
    attribution: attributionTracker.attribution,
  };
}

export async function aiDraftReply({
  messages,
  emailAccount,
  knowledgeBaseContent,
  replyMemoryContent = null,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  learnedWritingStyle = null,
  mcpContext,
  meetingContext,
  attachmentContext = null,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  replyMemoryContent?: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  learnedWritingStyle?: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
  attachmentContext?: string | null;
}) {
  const result = await aiDraftReplyWithConfidence({
    messages,
    emailAccount,
    knowledgeBaseContent,
    replyMemoryContent,
    emailHistorySummary,
    emailHistoryContext,
    calendarAvailability,
    writingStyle,
    learnedWritingStyle,
    mcpContext,
    meetingContext,
    attachmentContext,
  });

  return result.reply;
}

function normalizeDraftReplyFormatting(reply: string): string {
  const withNormalizedLineEndings = reply.replace(/\r\n?|\u2028|\u2029/g, "\n");

  const withDecodedEscapedNewlines = /\\r\\n|\\n|\\r/.test(
    withNormalizedLineEndings,
  )
    ? withNormalizedLineEndings
        .replace(/\\r\\n/g, "\n")
        .replace(/\\n/g, "\n")
        .replace(/\\r/g, "\n")
    : withNormalizedLineEndings;

  const cleaned = withDecodedEscapedNewlines
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const nonEmptyLines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (shouldConvertSingleLineBreaksToParagraphs(nonEmptyLines)) {
    return nonEmptyLines.join("\n\n");
  }

  return cleaned;
}

function shouldConvertSingleLineBreaksToParagraphs(lines: string[]): boolean {
  if (lines.length < 2) return false;

  if (lines.some((line) => isLikelyListItem(line))) return false;

  const punctuatedLines = lines.filter((line) => /[.!?]$/.test(line)).length;
  const punctuationRatio = punctuatedLines / lines.length;

  return punctuationRatio >= 0.6;
}

function isLikelyListItem(line: string): boolean {
  return /^(\s*[-*]\s+|\s*\d+[.)]\s+|\s*[a-zA-Z][.)]\s+|>\s+)/.test(line);
}

// Matches any non-separator, non-whitespace character repeated 50+ times in a row
const REPETITIVE_TEXT_PATTERN = /([^\s\-=_*.#~])\1{49,}/u;

function getSchedulingContext({
  calendarBookingLink,
  calendarAvailability,
}: {
  calendarBookingLink: string | null;
  calendarAvailability: CalendarAvailabilityContext | null;
}): string {
  const parts: string[] = [];

  if (calendarBookingLink) {
    parts.push(`<booking_link>
${calendarBookingLink}
</booking_link>

Share this booking link when scheduling with the user is clearly needed, not as a default call-to-action.`);
  }

  if (calendarAvailability?.noAvailability) {
    parts.push(`The user has no available time slots in the requested timeframe.
Do not suggest specific times. Acknowledge the request and suggest alternatives (e.g., "I'm fully booked tomorrow, but let's find another day that works"${calendarBookingLink ? " or share the booking link" : ""}).`);
  } else if (calendarAvailability?.suggestedTimes.length) {
    const times = calendarAvailability.suggestedTimes
      .map((slot) => `- ${slot.start} to ${slot.end}`)
      .join("\n");

    parts.push(`Available time slots:
${times}

${calendarBookingLink ? "If scheduling with the user is clearly needed, you may share the booking link and optionally suggest a few of these times as alternatives." : "When the sender is asking to schedule, respond concretely using these time slots. Treat supplied slots on or after today's date as valid; only ask for updated availability if every supplied slot is before today's date."} Format suggested times as a bulleted list.`);
  }

  if (parts.length === 0) return "";

  return `Scheduling context:

<scheduling>
${parts.join("\n\n")}
</scheduling>
`;
}
