import { z } from "zod";
import {
  KEBAB_CASE_REGEX,
  baseEvalCaseSchema,
} from "@/__tests__/eval/harness/case-schema";

const messageSchema = z.object({
  id: z.string().optional(),
  from: z.string().min(1),
  to: z.string().min(1),
  cc: z.string().optional(),
  replyTo: z.string().optional(),
  subject: z.string(),
  content: z.string().min(1),
  date: z.iso.datetime().optional(),
});

/**
 * `bookingLinks` and `calendarBookingLink` are not interchangeable and not
 * additive. `getCalendarBookingLinkForDraft` returns
 * `${NEXT_PUBLIC_BASE_URL}/book/${bookingLinks[0].slug}` when a native booking
 * link exists, and only falls back to the external `calendarBookingLink`
 * otherwise. A case that sets both is exercising the native link, and the
 * external URL it declares will never appear in a draft — which silently turns
 * any `replyOmitsUrl` check against that URL into a vacuous pass. Use
 * `replyOmitsBookingLink`, which resolves whichever link the product will
 * actually see.
 */
const emailAccountSchema = z.object({
  email: z.email(),
  about: z.string().nullable().default(null),
  timezone: z.string().nullable().default(null),
  calendarBookingLink: z.string().nullable().default(null),
  bookingLinks: z.array(z.object({ slug: z.string() })).default([]),
});

export type DraftReplyEmailAccountFixture = z.infer<typeof emailAccountSchema>;

/**
 * One key per context parameter of `aiDraftReplyWithConfidence`
 * (apps/web/utils/ai/reply/draft-reply.ts). This object is the ablation
 * surface: setting a key to null is a full ablation of that context source
 * with zero product-code change, so ablation variants are a map over these
 * keys rather than a fork of the drafting call.
 */
export const draftReplyContextSchema = z.object({
  knowledgeBaseContent: z.string().nullable().default(null),
  replyMemoryContent: z.string().nullable().default(null),
  emailHistorySummary: z.string().nullable().default(null),
  emailHistoryContext: z
    .object({
      notes: z.string().nullable().default(null),
      relevantEmails: z.array(z.string()).default([]),
    })
    .nullable()
    .default(null),
  senderReplyExamples: z.string().nullable().default(null),
  calendarAvailability: z
    .object({
      suggestedTimes: z
        .array(z.object({ start: z.string(), end: z.string() }))
        .default([]),
      noAvailability: z.boolean().optional(),
      timezone: z.string().nullable().default(null),
    })
    .nullable()
    .default(null),
  writingStyle: z.string().nullable().default(null),
  learnedWritingStyle: z.string().nullable().default(null),
  mcpContext: z.string().nullable().default(null),
  meetingContext: z.string().nullable().default(null),
  attachmentContext: z.string().nullable().default(null),
});

export type DraftReplyContext = z.infer<typeof draftReplyContextSchema>;
export type DraftReplyContextSource = keyof DraftReplyContext;

export const DRAFT_REPLY_CONTEXT_SOURCES = Object.keys(
  draftReplyContextSchema.shape,
) as DraftReplyContextSource[];

const draftConfidenceSchema = z.enum(["LOW", "MEDIUM", "HIGH"]);

/**
 * Named checks only. Case JSON never carries executable logic; every variant
 * here maps to exactly one function in @/__tests__/eval/harness/assertions.
 */
export const assertionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("replyContainsUrl"), url: z.string().min(1) }),
  z.object({ type: z.literal("replyOmitsUrl"), url: z.string().min(1) }),
  z.object({ type: z.literal("replyOmitsBookingLink") }),
  z.object({ type: z.literal("replyOmitsCalendarSlotTimes") }),
  z.object({ type: z.literal("replyOmitsEmDash") }),
  z.object({ type: z.literal("replyIsNonEmpty") }),
  z.object({
    type: z.literal("confidenceIn"),
    values: z.array(draftConfidenceSchema).min(1),
  }),
  z.object({
    type: z.literal("replyParagraphCountAtMost"),
    max: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("replyWordCountAtMost"),
    max: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("replyAddressesAllAsks"),
    // Coarse lexical pre-check for the multi-ask axis on English cases only.
    // The semantic authority on missed asks is the send-ready judge; this
    // exists so a draft that answers two of three fails without paying for a
    // judge call.
    asks: z
      .array(
        z.object({
          id: z.string().regex(KEBAB_CASE_REGEX),
          description: z.string().min(1),
          matchAny: z.array(z.string().min(1)).min(1),
        }),
      )
      .min(2),
  }),
]);

export type DraftReplyAssertion = z.infer<typeof assertionSchema>;

export const draftReplyCaseSchema = baseEvalCaseSchema.extend({
  suite: z.literal("draft-reply"),
  input: z.object({
    emailAccount: emailAccountSchema,
    messages: z.array(messageSchema).min(1),
    hasConfiguredSignature: z.boolean().default(false),
    currentDate: z.iso.datetime().nullable().default(null),
    context: draftReplyContextSchema,
  }),
  assertions: z.array(assertionSchema).default([]),
  expectedGroundTruth: z.string().min(1),
  judgeCriteria: z
    .array(
      z.object({
        id: z.string().regex(KEBAB_CASE_REGEX),
        criterion: z.string().min(1),
      }),
    )
    .default([]),
});

export type DraftReplyCase = z.infer<typeof draftReplyCaseSchema>;
