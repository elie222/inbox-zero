import {
  aiDraftReplyWithConfidence,
  DRAFT_CONFIDENCE_BY_LLM_LABEL,
  getCalendarBookingLinkForDraft,
} from "@/utils/ai/reply/draft-reply";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM } from "@/utils/types";
import { getEmail } from "@/__tests__/helpers";
import type { DraftOutput } from "@/__tests__/eval/harness/assertions";
import type { DraftReplyCase } from "@/__tests__/eval/harness/draft-reply-schema";

/**
 * The whole point of this harness: the case data is fed to the shipping
 * function, not to a copy of its prompt. Everything the product does around the
 * model call — prompt hardening, the retry on repetitive output, confidence
 * mapping, attribution, the writing-style fallback — is therefore in the
 * measurement.
 *
 * Case context keys are named after the parameters of
 * `aiDraftReplyWithConfidence`, so this is a rename-free pass-through and an
 * ablation is a map over `input.context` rather than a fork of the call.
 */
export async function invokeDraftReply({
  evalCase,
  emailAccount,
}: {
  evalCase: DraftReplyCase;
  emailAccount: EmailAccountWithAI;
}): Promise<DraftOutput> {
  const { input } = evalCase;
  const context = input.context;

  const result = await aiDraftReplyWithConfidence({
    messages: input.messages.map(toEmailForLLM),
    emailAccount: {
      ...emailAccount,
      email: input.emailAccount.email,
      about: input.emailAccount.about,
      timezone: input.emailAccount.timezone,
      calendarBookingLink: input.emailAccount.calendarBookingLink,
      bookingLinks: input.emailAccount.bookingLinks,
    },
    knowledgeBaseContent: context.knowledgeBaseContent,
    replyMemoryContent: context.replyMemoryContent,
    emailHistorySummary: context.emailHistorySummary,
    emailHistoryContext: context.emailHistoryContext,
    senderReplyExamples: context.senderReplyExamples,
    calendarAvailability: context.calendarAvailability,
    writingStyle: context.writingStyle,
    learnedWritingStyle: context.learnedWritingStyle,
    mcpContext: context.mcpContext,
    meetingContext: context.meetingContext,
    attachmentContext: context.attachmentContext,
    hasConfiguredSignature: input.hasConfiguredSignature,
    currentDate: input.currentDate ? new Date(input.currentDate) : undefined,
  });

  return {
    reply: result.reply,
    confidence: toLlmConfidence(result.confidence),
  };
}

/** What the judges and the report show for a sample. */
export function describeThread(evalCase: DraftReplyCase): string {
  return evalCase.input.messages
    .map(
      (message) =>
        `From: ${message.from}\nTo: ${message.to}\nSubject: ${message.subject}\n\n${message.content}`,
    )
    .join("\n\n---\n\n");
}

/**
 * Only the context the model was actually given. The judge grades "is this
 * claim supported", so handing it anything the drafting call did not see would
 * let unsupported content pass.
 */
export function describeContext(evalCase: DraftReplyCase): string {
  const context = evalCase.input.context;
  const parts = Object.entries(context)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([key, value]) =>
      typeof value === "string"
        ? `<${key}>\n${value}\n</${key}>`
        : `<${key}>\n${JSON.stringify(value, null, 2)}\n</${key}>`,
    );

  const { about } = evalCase.input.emailAccount;
  if (about) parts.unshift(`<userAbout>\n${about}\n</userAbout>`);

  const bookingLink = getCalendarBookingLinkForDraft(
    evalCase.input.emailAccount,
  );
  if (bookingLink) {
    parts.unshift(`<booking_link>\n${bookingLink}\n</booking_link>`);
  }

  return parts.join("\n\n");
}

function toEmailForLLM(
  message: DraftReplyCase["input"]["messages"][number],
): EmailForLLM & { to: string } {
  return {
    ...getEmail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      content: message.content,
      ...(message.cc ? { cc: message.cc } : {}),
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.date ? { date: new Date(message.date) } : {}),
    }),
    ...(message.id ? { id: message.id } : {}),
    to: message.to,
  };
}

/**
 * Cases assert on the model-facing label, the product returns the enum that
 * gates whether a draft is shown. Inverting the product's own table rather
 * than restating the correspondence means a remap on that side cannot leave
 * the harness silently reporting the previous semantics.
 */
function toLlmConfidence(
  confidence: Awaited<
    ReturnType<typeof aiDraftReplyWithConfidence>
  >["confidence"],
): DraftOutput["confidence"] {
  const label = LLM_LABEL_BY_DRAFT_CONFIDENCE.get(confidence);
  if (!label) {
    throw new Error(
      `No model-facing label maps to DraftReplyConfidence.${confidence}. Update DRAFT_CONFIDENCE_BY_LLM_LABEL or the case schema.`,
    );
  }
  return label;
}

const LLM_LABEL_BY_DRAFT_CONFIDENCE = new Map(
  Object.entries(DRAFT_CONFIDENCE_BY_LLM_LABEL).map(([label, confidence]) => [
    confidence,
    label as DraftOutput["confidence"],
  ]),
);
