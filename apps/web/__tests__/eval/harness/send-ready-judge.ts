import { generateObject } from "ai";
import { z } from "zod";
import { getHarnessJudgeModel } from "@/__tests__/eval/harness/judge-model";
import {
  EDIT_FAILURE_MODES,
  EDIT_SEVERITIES,
  MODE_DEFINITIONS,
  type EditFailureMode,
} from "@/__tests__/eval/harness/taxonomy";

/**
 * NO_MEANINGFUL_EDIT describes a draft the user accepted. It is a label for the
 * mining pipeline, which sees the sent text; reference-free it would just be a
 * second way of saying "pass", so the judge cannot choose it.
 */
const PRIMARY_ISSUE_MODES = EDIT_FAILURE_MODES.filter(
  (mode) => mode !== "NO_MEANINGFUL_EDIT",
);

const MAX_TEXT_CHARS = 12_000;

const judgeSchema = z.object({
  distinctAsks: z
    .array(z.string())
    .describe(
      "Every distinct thing the inbound message asks for or requires a response to, one per entry. An email with one request has one entry.",
    ),
  unaddressedAsks: z
    .array(z.string())
    .describe(
      "The subset of distinctAsks the draft does not actually answer. Deferring an ask counts as answering it only if the draft explicitly says so.",
    ),
  deletableWithoutLoss: z
    .array(z.string())
    .describe(
      "Sentences or clauses in the draft that could be deleted without the recipient losing anything they need. Quote them.",
    ),
  unsupportedClaims: z
    .array(z.string())
    .describe(
      "Facts, numbers, dates, statuses, or commitments the draft asserts that are not supported by the thread or the provided context.",
    ),
  reasoning: z
    .string()
    .describe(
      "Two to three sentences naming the single most damaging thing about this draft, or if it passes, the specific thing that would have made it fail and did not. Do not restate the rules.",
    ),
  sendReady: z
    .boolean()
    .describe(
      "True only if the recipient of this drafting assistant would send the text exactly as written, with no edits at all.",
    ),
  primaryIssue: z
    .enum(PRIMARY_ISSUE_MODES)
    .nullable()
    .describe(
      "When sendReady is false, the single failure mode that best explains why. Null only when sendReady is true.",
    ),
  severity: z
    .enum(EDIT_SEVERITIES)
    .describe(
      "none when send-ready, minor for a stylistic rewrite, major for a substantive correction or omission, total when the user would start over.",
    ),
});

export type SendReadyVerdict = {
  sendReady: boolean;
  primaryIssue: EditFailureMode | null;
  severity: (typeof EDIT_SEVERITIES)[number];
  reasoning: string;
  distinctAsks: string[];
  unaddressedAsks: string[];
  deletableWithoutLoss: string[];
  unsupportedClaims: string[];
  guardsFired: string[];
};

export const SEND_READY_SYSTEM_PROMPT = `You grade an email drafting assistant against one standard: would the person this draft was written FOR send it as written?

You are not asked whether the draft is polite, professional, or well-formed. Almost every draft is. You are asked whether the sender would have to fix something before it goes out.

## Calibration — read this before grading

The bar is a competent professional's own reply, not an ideal one.

Real correspondence contains a greeting, some warmth, and the occasional sentence that could technically be cut. That is normal writing, not padding. If you would fail an email that a real person actually wrote and sent to a colleague or customer, your bar is wrong.

Fail a draft when the sender would have to change something: a defect that makes it incorrect, incomplete, or embarrassing. Do not fail a draft for being merely improvable. Almost every piece of writing is improvable; that is not the question.

Two failure classes matter far more than the rest, because they cost the sender real work or real credibility: something asked for is missing, and something asserted is wrong. Weight them accordingly.

## sendReady is false if ANY of the following holds

1. MISSED ASK. The inbound contains more than one distinct request and the draft does not address every one. Answering two of three is a failure, not a partial pass. Explicitly saying "I will confirm X separately" counts as addressing X. Silently omitting X does not.

2. UNSUPPORTED CONTENT. A fact, number, date, price, status, or attribution that is contradicted by the thread and context, or that the assistant would have had to invent.
   Important: a sender legitimately knows things the thread never states — their own availability, their pricing, their internal status, their team's plans. Do NOT fail a draft merely because a fact is not restated in the context you were given. Fail it when the claim conflicts with the context, or when it is a specific external fact nobody in this conversation could have supplied.

3. WRONG COMMITMENT. The draft commits the sender to a time, price, deliverable, or promise that the context does not authorise. Offering a specific meeting slot with no calendar information is the common case.

4. DISPROPORTIONATE LENGTH. The draft is long enough that the sender would trim it before sending — roughly twice what the task warrants, or carrying a whole paragraph that does no work.
   The test is NOT "could a word be cut" — almost always yes, for any real email. The test is "would a busy sender stop and delete something". A greeting, one courteous sentence, or a brief closing is not padding.

5. RESTATEMENT. The draft summarises back what the inbound already said, at length. The recipient wrote it. A brief acknowledgement is fine; a paragraph replaying their message is not.

6. UNREQUESTED EXPANSION. Offering calls, documents, availability, or next steps nobody asked for, on a thread where the sender had closed the loop.

7. UNNECESSARY QUESTION. Asking the recipient for something the thread or context already answers.

8. GROUND TRUTH MISS. The draft does not accomplish what the ground truth says a good reply must accomplish.

9. LANGUAGE OR REGISTER. Written in a different language than the thread, or at a formality level that would read as wrong from this sender. Context supplied in one language does not license replying in that language; match the thread.

## sendReady is true when

The draft addresses every ask, asserts nothing that conflicts with the context, commits to nothing it should not, and is proportionate to the task. It does not have to be the best possible reply. It has to be one the sender would send.

A single-line reply that fully answers the question is an excellent draft, not a lazy one.

## What is NOT a failure

- Brevity. Short is the target. Never fail a draft for being too short unless something asked for is actually missing.
- A missing greeting, sign-off, or signature. A signature is appended downstream.
- A greeting line, or one short courteous sentence. That is normal email, not padding.
- Declining to state a fact that is genuinely unavailable. Hedging is correct there, provided it is brief and the draft still moves things forward.
- Stating a fact the sender would plausibly know about their own business, schedule, or product, even if the context does not repeat it.
- Wording that differs from the ground truth. The ground truth describes what the reply must accomplish, not how it must be phrased.
- Formatting or paragraph choices a person would not bother to change.
- Placeholders are not automatically a failure, but a draft the user must fill in before sending is not send-ready.

## Filling in the fields

- distinctAsks: enumerate what the inbound actually requires a response to, before you look at the draft. Do not merge two requests into one entry.
- unaddressedAsks: the subset the draft leaves unanswered.
- deletableWithoutLoss: quote only spans the SENDER would actually stop and delete before hitting send. Not spans that could theoretically be tightened — that set is non-empty for essentially all real writing, so listing those makes this field meaningless. An empty list is the normal case for a well-judged reply.
- unsupportedClaims: quote only spans that CONFLICT with the thread or context, or state a specific external fact nobody in this conversation could have supplied. Do not list facts the sender would know about their own business.
- reasoning: name the single most damaging thing. If it passes, name the thing that nearly made it fail.
- primaryIssue: when it fails, the one mode that best explains the failure. Pick the most specific applicable mode, not the most general.
- severity: how much work the user would have to do to fix it.`;

export async function judgeSendReady({
  inboundThread,
  draft,
  groundTruth,
  context,
  signal,
}: {
  inboundThread: string;
  draft: string;
  groundTruth: string;
  context?: string | null;
  signal?: AbortSignal;
}): Promise<SendReadyVerdict> {
  const { model, providerOptions } = getHarnessJudgeModel();

  const { object } = await generateObject({
    model,
    providerOptions,
    schema: judgeSchema,
    system: `${SEND_READY_SYSTEM_PROMPT}

## Failure modes

${PRIMARY_ISSUE_MODES.map((mode) => `- ${mode}: ${MODE_DEFINITIONS[mode]}`).join("\n")}`,
    prompt: buildPrompt({ inboundThread, draft, groundTruth, context }),
    temperature: 0,
    maxRetries: 2,
    abortSignal: signal,
  });

  return applyConsistencyGuards(object);
}

/**
 * A judge that enumerates real problems and then passes the draft anyway is the
 * exact failure that produced 19/19. Where the judge's own findings are
 * unambiguous failures by definition, the verdict follows the findings.
 */
function applyConsistencyGuards(
  object: z.infer<typeof judgeSchema>,
): SendReadyVerdict {
  const guardsFired: string[] = [];
  let sendReady = object.sendReady;
  let primaryIssue: EditFailureMode | null = object.primaryIssue;
  let severity = object.severity;

  if (sendReady && object.unaddressedAsks.length > 0) {
    guardsFired.push("unaddressed_asks");
    sendReady = false;
    primaryIssue = "MISSED_ASK";
  }

  if (sendReady && object.unsupportedClaims.length > 0) {
    guardsFired.push("unsupported_claims");
    sendReady = false;
    primaryIssue = "FACTUAL_CORRECTION";
  }

  if (sendReady) {
    primaryIssue = null;
    severity = "none";
  } else {
    if (primaryIssue === null) {
      guardsFired.push("missing_primary_issue");
      primaryIssue = inferPrimaryIssue(object);
    }
    if (severity === "none") severity = "major";
  }

  return {
    sendReady,
    primaryIssue,
    severity,
    reasoning: object.reasoning,
    distinctAsks: object.distinctAsks,
    unaddressedAsks: object.unaddressedAsks,
    deletableWithoutLoss: object.deletableWithoutLoss,
    unsupportedClaims: object.unsupportedClaims,
    guardsFired,
  };
}

function inferPrimaryIssue(
  object: z.infer<typeof judgeSchema>,
): EditFailureMode {
  if (object.unsupportedClaims.length > 0) return "FACTUAL_CORRECTION";
  if (object.unaddressedAsks.length > 0) return "MISSED_ASK";
  if (object.deletableWithoutLoss.length > 0) return "VERBOSE_PADDING";
  return "FULL_REWRITE";
}

function buildPrompt({
  inboundThread,
  draft,
  groundTruth,
  context,
}: {
  inboundThread: string;
  draft: string;
  groundTruth: string;
  context?: string | null;
}): string {
  return `<thread>
${truncate(inboundThread)}
</thread>

<context_available_to_the_assistant>
${context?.trim() ? truncate(context) : "No context beyond the thread was provided. Any fact not in the thread is unsupported."}
</context_available_to_the_assistant>

<ground_truth>
${truncate(groundTruth)}
</ground_truth>

<draft>
${truncate(draft)}
</draft>

Would this person send the draft exactly as written?`;
}

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_TEXT_CHARS)}\n[truncated]`;
}
