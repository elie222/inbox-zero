import { z } from "zod";
import { TZDate } from "@date-fns/tz";
import { createScopedLogger } from "@/utils/logger";
import { createGenerateObject } from "@/utils/llms/index";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmailListPrompt, getTodayForLLM } from "@/utils/ai/helpers";
import { getModel } from "@/utils/llms/model";
import { appendOllamaOnlySystemGuidance } from "@/utils/llms/ollama-guidance";
import type { ReplyContextCollectorResult } from "@/utils/ai/reply/reply-context-collector";
import type { CalendarAvailabilityContext } from "@/utils/ai/calendar/availability";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { env } from "@/env";
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
Ground facts, terms, statuses, dates, approvals, attachments, completed actions, and external changes in the thread or provided context.
When key context is missing, still draft the most useful reply you can, but use lower confidence when the draft relies on assumptions or user-fillable details.
Treat email dates as message metadata, not calendar context.
Do not use em dashes unless the provided writing style explicitly calls for them.
Don't suggest meeting times or mention availability unless specific calendar information is provided.
When the sender provides a scheduling link or scheduling process, use that path instead of adding the user's booking link.

Write an email that follows up on the previous conversation.
Your reply should aim to continue the conversation or provide new information based on the context or knowledge base. If you have nothing substantial to add, keep the reply minimal.
`;

const defaultWritingStyle = `Keep it concise, direct, and friendly.
Keep the reply short. Aim for 2 sentences at most unless a brief answer to multiple questions needs more.
Don't be pushy.
Write in a plainspoken, professional tone.
Prefer short declarative sentences over polished or overly elaborate phrasing.`;

type DraftEmailAccount = EmailAccountWithAI & {
  bookingLinks?: { slug: string }[];
};

const getUserPrompt = ({
  messages,
  emailAccount,
  knowledgeBaseContent,
  replyMemoryContent,
  emailHistorySummary,
  emailHistoryContext,
  senderReplyExamples,
  calendarAvailability,
  writingStyle,
  learnedWritingStyle,
  mcpContext,
  meetingContext,
  attachmentContext,
  hasConfiguredSignature,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: DraftEmailAccount;
  knowledgeBaseContent: string | null;
  replyMemoryContent: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  senderReplyExamples: string | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  learnedWritingStyle: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
  attachmentContext: string | null;
  hasConfiguredSignature: boolean;
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

  const senderReplyExamplesContext = senderReplyExamples
    ? `Past replies to this sender. Use for relationship, tone, brevity, and directness; current thread/context facts still win.

<sender_reply_examples>
${senderReplyExamples}
</sender_reply_examples>
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
    calendarBookingLink: getCalendarBookingLinkForDraft(emailAccount),
    calendarAvailability,
    userTimezone: calendarAvailability?.timezone || emailAccount.timezone,
  });

  const mcpToolsContext = mcpContext
    ? `Additional context fetched from external tools (such as CRM systems, task managers, or other integrations) that may help draft a response:

<external_tools_context>
${mcpContext}
</external_tools_context>
`
    : "";

  const missingExternalContext =
    !knowledgeBaseContent &&
    !emailHistorySummary &&
    !emailHistoryContext?.relevantEmails.length &&
    !mcpContext &&
    !meetingContext &&
    !attachmentContext
      ? `No additional factual context was provided beyond the email thread.
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
  const signatureContext = hasConfiguredSignature
    ? `The user's email account already has a configured signature that will be appended after this draft. Do not write any closing, sign-off, name, title, contact details, or signature block.
`
    : "";

  return `${userAbout}
${relevantKnowledge}
${learnedReplyMemories}
${historicalContext}
${precedentHistoryContext}
${senderReplyExamplesContext}
${writingStylePrompt}
${learnedWritingStylePrompt}
${signatureContext}
${schedulingContext}
${mcpToolsContext}
${missingExternalContext}
${upcomingMeetingsContext}
${selectedAttachments}

Here is the context of the email thread (from oldest to newest):
${getEmailListPrompt({ messages, messageMaxLength: 3000 })}

Please write a reply to the email.
${getTodayForLLM()}
IMPORTANT: You are writing an email as ${emailAccount.email}. Write the reply from their perspective.`;
};

const llmDraftConfidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

const draftSchema = z.object({
  reply: z
    .string()
    .describe(
      "The complete email reply draft incorporating knowledge base information",
    ),
  confidence: llmDraftConfidenceSchema.describe(
    "Use HIGH only when the draft is complete, grounded, and does not depend on missing facts, unavailable calendar/business state, assumptions, or user-fillable details. Use MEDIUM for useful drafts that rely on reasonable assumptions, missing facts, or user-fillable details. Use LOW when the draft is highly uncertain, likely needs broader thread/context review, or mainly asks/checks/follows up.",
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
  senderReplyExamples = null,
  calendarAvailability,
  writingStyle,
  learnedWritingStyle = null,
  mcpContext,
  meetingContext,
  attachmentContext = null,
  hasConfiguredSignature = false,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: DraftEmailAccount;
  knowledgeBaseContent: string | null;
  replyMemoryContent?: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  senderReplyExamples?: string | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  learnedWritingStyle?: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
  attachmentContext?: string | null;
  hasConfiguredSignature?: boolean;
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
    senderReplyExamples,
    calendarAvailability,
    writingStyle: effectiveWritingStyle,
    learnedWritingStyle: advisoryLearnedWritingStyle,
    mcpContext,
    meetingContext,
    attachmentContext,
    hasConfiguredSignature,
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
      system: appendOllamaOnlySystemGuidance(
        { system: systemPrompt },
        modelOptions,
        OLLAMA_DRAFT_RESPONSE_GUIDANCE,
      ).system,
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
    confidence: mapLlmDraftConfidence(result.object.confidence),
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
  senderReplyExamples = null,
  calendarAvailability,
  writingStyle,
  learnedWritingStyle = null,
  mcpContext,
  meetingContext,
  attachmentContext = null,
  hasConfiguredSignature = false,
}: {
  messages: (EmailForLLM & { to: string })[];
  emailAccount: DraftEmailAccount;
  knowledgeBaseContent: string | null;
  replyMemoryContent?: string | null;
  emailHistorySummary: string | null;
  emailHistoryContext: ReplyContextCollectorResult | null;
  senderReplyExamples?: string | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  writingStyle: string | null;
  learnedWritingStyle?: string | null;
  mcpContext: string | null;
  meetingContext: string | null;
  attachmentContext?: string | null;
  hasConfiguredSignature?: boolean;
}) {
  const result = await aiDraftReplyWithConfidence({
    messages,
    emailAccount,
    knowledgeBaseContent,
    replyMemoryContent,
    emailHistorySummary,
    emailHistoryContext,
    senderReplyExamples,
    calendarAvailability,
    writingStyle,
    learnedWritingStyle,
    mcpContext,
    meetingContext,
    attachmentContext,
    hasConfiguredSignature,
  });

  return result.reply;
}

export function normalizeDraftReplyFormatting(reply: string): string {
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

  const withRepairedCollapsedParagraphs =
    repairCollapsedParagraphBoundaries(cleaned);

  const nonEmptyLines = withRepairedCollapsedParagraphs
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (shouldConvertSingleLineBreaksToParagraphs(nonEmptyLines)) {
    return nonEmptyLines.join("\n\n");
  }

  return withRepairedCollapsedParagraphs;
}

function repairCollapsedParagraphBoundaries(reply: string): string {
  if (reply.includes("\n")) return reply;

  const gluedSentenceBoundaryPattern = /([a-z0-9][.!?])(?=[A-Z])/g;
  const boundaryMatches = reply.match(gluedSentenceBoundaryPattern);

  if (!boundaryMatches || boundaryMatches.length < 2) return reply;

  return reply.replace(gluedSentenceBoundaryPattern, "$1\n\n");
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

function mapLlmDraftConfidence(confidence: unknown): DraftReplyConfidence {
  const llmConfidence = llmDraftConfidenceSchema.safeParse(confidence);
  if (!llmConfidence.success) {
    return normalizeDraftReplyConfidence(confidence);
  }

  switch (llmConfidence.data) {
    case "LOW":
      return DraftReplyConfidence.ALL_EMAILS;
    case "MEDIUM":
      return DraftReplyConfidence.STANDARD;
    case "HIGH":
      return DraftReplyConfidence.HIGH_CONFIDENCE;
  }
}

// Matches any non-separator, non-whitespace character repeated 50+ times in a row
const REPETITIVE_TEXT_PATTERN = /([^\s\-=_*.#~])\1{49,}/u;

function getSchedulingContext({
  calendarBookingLink,
  calendarAvailability,
  userTimezone,
}: {
  calendarBookingLink: string | null;
  calendarAvailability: CalendarAvailabilityContext | null;
  userTimezone: string | null | undefined;
}): string {
  const parts: string[] = [];
  const timezone = userTimezone || "UTC";

  if (calendarBookingLink) {
    parts.push(`<booking_link>
${calendarBookingLink}
</booking_link>

When scheduling with the user is clearly needed, prefer sharing this booking link over listing specific availability. Do not use it as a default call-to-action for non-scheduling emails.`);
  }

  if (calendarAvailability?.noAvailability) {
    const timezoneLabel = getTimezoneLabel(timezone);

    parts.push(`The user has no available time slots in the requested timeframe in ${timezoneLabel}.
Do not suggest specific times. Acknowledge the request and suggest alternatives (e.g., "I'm fully booked tomorrow, but let's find another day that works"${calendarBookingLink ? " or share the booking link" : ""}).`);
  } else if (calendarAvailability?.suggestedTimes.length) {
    const times = calendarAvailability.suggestedTimes
      .map((slot) =>
        formatAvailableSlotForPrompt(
          slot,
          timezone,
          getTimezoneLabel(timezone, slot.start),
        ),
      )
      .join("\n");
    const timezoneLabels = getTimezoneLabelsForSlots(
      timezone,
      calendarAvailability.suggestedTimes,
    );

    parts.push(`Available time slots are in ${timezoneLabels}.
If the sender requested or uses another timezone, express proposed times in that timezone after converting from the user's available slots.
If you list specific times, include the user-facing timezone label shown for each slot and do not write raw timezone identifiers such as ${timezone}.

Available time slots:
${times}

${calendarBookingLink ? "Because the user has a booking link, share the booking link instead of listing specific times unless the sender explicitly asks the user to provide times, asks about a specific proposed time/date, or the booking link would not answer the scheduling request." : "When the sender is asking to schedule, respond concretely using these time slots. Treat supplied slots on or after today's date as valid; only ask for updated availability if every supplied slot is before today's date."} Format suggested times as a bulleted list.`);
  }

  if (parts.length === 0) return "";

  return `Scheduling context:

<scheduling>
${parts.join("\n\n")}
</scheduling>
`;
}

function getCalendarBookingLinkForDraft(emailAccount: DraftEmailAccount) {
  const inboxZeroBookingLink = emailAccount.bookingLinks?.[0];

  if (inboxZeroBookingLink) {
    return `${env.NEXT_PUBLIC_BASE_URL.replace(/\/$/, "")}/book/${inboxZeroBookingLink.slug}`;
  }

  return emailAccount.calendarBookingLink;
}

function formatAvailableSlotForPrompt(
  slot: { start: string; end: string },
  timezone: string,
  timezoneLabel: string,
): string {
  const utcStart = formatLocalSlotTimeAsUtc(slot.start, timezone);
  const utcEnd = formatLocalSlotTimeAsUtc(slot.end, timezone);

  if (!utcStart || !utcEnd) {
    return `- ${slot.start} to ${slot.end}`;
  }

  return `- ${slot.start} to ${slot.end} (${timezoneLabel}; UTC ${utcStart} to ${utcEnd})`;
}

function formatLocalSlotTimeAsUtc(
  localTime: string,
  timezone: string,
): string | null {
  const match = localTime.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);

  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const date = new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
    timezone,
  );

  const utcDate = new Date(date.getTime());
  if (Number.isNaN(utcDate.getTime())) return null;

  return utcDate.toISOString().slice(0, 16).replace("T", " ");
}

function getTimezoneLabel(timezone: string, localTime?: string): string {
  if (timezone === "UTC") return "UTC";

  const date = localTime
    ? createDateFromLocalTime(localTime, timezone)
    : new Date();
  const label =
    getIntlTimezoneName(timezone, date, "short") ||
    getIntlTimezoneName(timezone, date, "shortOffset");

  return label && label !== timezone ? label : timezone;
}

function getTimezoneLabelsForSlots(
  timezone: string,
  slots: { start: string }[],
): string {
  const labels = [
    ...new Set(slots.map((slot) => getTimezoneLabel(timezone, slot.start))),
  ];

  return labels.join("/");
}

function createDateFromLocalTime(localTime: string, timezone: string): Date {
  const match = localTime.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);

  if (!match) return new Date();

  const [, year, month, day, hour, minute] = match;

  return new TZDate(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    0,
    0,
    timezone,
  );
}

function getIntlTimezoneName(
  timezone: string,
  date: Date,
  timeZoneName: "short" | "shortOffset",
): string | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName,
    }).formatToParts(date);

    return (
      parts.find((part) => part.type === "timeZoneName")?.value.trim() || null
    );
  } catch {
    return null;
  }
}

const OLLAMA_DRAFT_RESPONSE_GUIDANCE = [
  'Return a JSON object with exactly two top-level fields: "reply" and "confidence".',
  '"reply" must be one complete email reply as a single plain-text string, not an array of alternatives.',
  '"confidence" must be one of "LOW", "MEDIUM", or "HIGH".',
  'Example valid output: {"reply":"Thanks for reaching out. I will take a look and follow up shortly.","confidence":"MEDIUM"}',
] as const;
