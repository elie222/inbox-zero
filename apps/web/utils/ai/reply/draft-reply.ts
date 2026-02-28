import { z } from "zod";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateObject } from "@/utils/llms/index";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";
import type { ReplyContextCollectorResult } from "@/utils/ai/reply/reply-context-collector";
import type { CalendarAvailabilityContext } from "@/utils/ai/calendar/availability";
import {
  PLAIN_TEXT_OUTPUT_INSTRUCTION,
  PROMPT_SECURITY_INSTRUCTIONS,
} from "@/utils/ai/security";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { normalizeDraftReplyConfidence } from "@/utils/ai/reply/draft-confidence";

const logger = createScopedLogger("DraftReply");

const systemPrompt = `You are an expert assistant that drafts email replies using knowledge base information.

${PROMPT_SECURITY_INSTRUCTIONS}

Use context from the previous emails and the provided knowledge base to make it relevant and accurate.
IMPORTANT: Do NOT simply repeat or mirror what the last email said. It doesn't add anything to the conversation to repeat back to them what they just said.
Don't mention that you're an AI.
Don't reply with a Subject. Only reply with the body of the email.
IMPORTANT: ${PLAIN_TEXT_OUTPUT_INSTRUCTION}
IMPORTANT: Format paragraphs using Unix newlines: use "\n\n" between paragraphs and "\n" for single line breaks.
Write the reply in the same language as the latest message in the thread.

IMPORTANT: Use placeholders sparingly! Only use them where you have limited information.
Never use placeholders for the user's name. You do not need to sign off with the user's name. Do not add a signature.
Do not invent information.
Don't suggest meeting times or mention availability unless specific calendar information is provided.

Write an email that follows up on the previous conversation.
Your reply should aim to continue the conversation or provide new information based on the context or knowledge base. If you have nothing substantial to add, keep the reply minimal.
`;

const defaultWritingStyle = `Keep it concise and friendly.
Keep the reply short. Aim for 2 sentences at most.
Don't be pushy.
Write in a polite and professional tone.`;

const getUserPrompt = ({
  messages,
  emailAccount,
  knowledgeBaseContent,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  mcpContext,
  meetingContext,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
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

  const calendarContext = calendarAvailability?.noAvailability
    ? `Calendar availability information:

<calendar_availability>
The user has NO available time slots in the requested timeframe (fully booked).
</calendar_availability>

IMPORTANT: The user is NOT available. Do NOT suggest specific times. You may acknowledge the request and suggest alternative approaches (e.g., "I'm fully booked tomorrow, but let's find another day that works" or share a booking link if available).
`
    : calendarAvailability?.suggestedTimes.length
      ? `Calendar availability information:

<calendar_availability>
Suggested time slots:
${calendarAvailability.suggestedTimes.map((slot) => `- ${slot.start} to ${slot.end}`).join("\n")}
</calendar_availability>

IMPORTANT: Use these available time slots when responding to meeting requests. Mention specific times the user is available.
`
      : "";

  const bookingLinkContext = emailAccount.calendarBookingLink
    ? `Calendar booking link:

<booking_link>
${emailAccount.calendarBookingLink}
</booking_link>

Only include this link if the sender explicitly requested a call or meeting. Do not proactively suggest calls.
`
    : "";

  const mcpToolsContext = mcpContext
    ? `Additional context fetched from external tools (such as CRM systems, task managers, or other integrations) that may help draft a response:

<external_tools_context>
${mcpContext}
</external_tools_context>
`
    : "";

  const upcomingMeetingsContext = meetingContext || "";

  return `${userAbout}
${relevantKnowledge}
${historicalContext}
${precedentHistoryContext}
${writingStylePrompt}
${calendarContext}
${bookingLinkContext}
${mcpToolsContext}
${upcomingMeetingsContext}

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
      "Required value: ALL_EMAILS, STANDARD, or HIGH_CONFIDENCE. Use ALL_EMAILS when uncertain or context is missing, STANDARD for solid drafts with minor uncertainty, and HIGH_CONFIDENCE only when intent and response are clear.",
    ),
});

export type DraftReplyResult = {
  reply: string;
  confidence: DraftReplyConfidence;
};

export async function aiDraftReplyWithConfidence({
  messages,
  emailAccount,
  knowledgeBaseContent,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  mcpContext,
  meetingContext,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
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

  const prompt = getUserPrompt({
    messages,
    emailAccount,
    knowledgeBaseContent,
    emailHistorySummary,
    emailHistoryContext,
    calendarAvailability,
    writingStyle: writingStyle || defaultWritingStyle,
    mcpContext,
    meetingContext,
  });

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Draft reply",
    modelOptions,
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
  };
}

export async function aiDraftReply({
  messages,
  emailAccount,
  knowledgeBaseContent,
  emailHistorySummary,
  emailHistoryContext,
  calendarAvailability,
  writingStyle,
  mcpContext,
  meetingContext,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: EmailAccountWithAI;
  knowledgeBaseContent: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
}) {
  const result = await aiDraftReplyWithConfidence({
    messages,
    emailAccount,
    knowledgeBaseContent,
    emailHistorySummary,
    emailHistoryContext,
    calendarAvailability,
    writingStyle,
    mcpContext,
    meetingContext,
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
