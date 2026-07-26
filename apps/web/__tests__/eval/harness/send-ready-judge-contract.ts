/**
 * The judge contract: prompt, output schema, and the consistency guards.
 *
 * Deliberately free of product imports so the calibration script in the
 * private evals repo can import this file directly rather than keeping a
 * second copy. The two forked once already, and the fork silently invalidated
 * a calibration report — the numbers described a prompt that was no longer the
 * one grading runs.
 *
 * The model call lives in send-ready-judge.ts, which is the only part that
 * needs provider plumbing.
 */

import { z } from "zod";
import {
  EDIT_FAILURE_MODES,
  EDIT_SEVERITIES,
  MODE_DEFINITIONS,
  USABILITY_OUTCOMES,
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

export const judgeSchema = z.object({
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
  usability: z
    .enum(USABILITY_OUTCOMES)
    .describe(
      "send-ready when it goes as written. needs-fill when the draft is correct and complete except that it openly leaves a fact for the user to supply, via a placeholder or an explicit gap. not-usable when it is wrong, incomplete, or would embarrass the sender.",
    ),
});

export type SendReadyVerdict = {
  sendReady: boolean;
  usability: (typeof USABILITY_OUTCOMES)[number];
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
- Placeholders are not automatically a failure, but a draft the user must fill in before sending is not send-ready. Grade it "needs-fill" rather than "not-usable" (see below).

## The three usability outcomes

The sendReady field is the strict question. The usability field records what the draft is actually worth, because a draft that leaves an honest gap and a draft that invents the missing value are not the same product outcome even though both fail sendReady.

- **send-ready** — goes out as written. Always set this when sendReady is true.
- **needs-fill** — correct and complete except that it openly leaves something for the sender to supply: a bracketed placeholder, an explicit blank, or a plainly flagged gap. The sender fills one slot and sends. Nothing in it is wrong.
- **not-usable** — wrong, incomplete, or embarrassing. Use this whenever the draft asserts something it cannot support, misses an ask without flagging it, or would need rewriting rather than filling.

A draft that states an invented figure is **not-usable**, never needs-fill, however confidently or politely it is phrased. Inventing a value and marking a gap are opposites: one is a silent error the sender may miss, the other is a visible instruction the sender acts on.

## Filling in the fields

- distinctAsks: enumerate what the inbound actually requires a response to, before you look at the draft. Do not merge two requests into one entry.
- unaddressedAsks: the subset the draft leaves unanswered.
- deletableWithoutLoss: quote only spans the SENDER would actually stop and delete before hitting send. Not spans that could theoretically be tightened — that set is non-empty for essentially all real writing, so listing those makes this field meaningless. An empty list is the normal case for a well-judged reply.
- unsupportedClaims: quote only spans that CONFLICT with the thread or context, or state a specific external fact nobody in this conversation could have supplied. Do not list facts the sender would know about their own business.
- reasoning: name the single most damaging thing. If it passes, name the thing that nearly made it fail.
- primaryIssue: when it fails, the one mode that best explains the failure. Pick the most specific applicable mode, not the most general.
- severity: how much work the user would have to do to fix it.
- usability: one of the three outcomes above. Set it from what the draft actually is, not from how confident it sounds.`;

/**
 * A judge that enumerates real problems and then passes the draft anyway is the
 * exact failure that produced 19/19. Where the judge's own findings are
 * unambiguous failures by definition, the verdict follows the findings.
 */
export function applyConsistencyGuards(
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

  // The two fields answer different questions and the model can report them
  // inconsistently, so send-ready wins and usability is reconciled to it.
  // A draft that invented a fact is never merely needs-fill, however honestly
  // it framed the invention.
  let usability = object.usability;
  if (sendReady) {
    usability = "send-ready";
  } else if (usability === "send-ready") {
    guardsFired.push("usability_contradicts_send_ready");
    usability = "not-usable";
  } else if (
    usability === "needs-fill" &&
    object.unsupportedClaims.length > 0
  ) {
    guardsFired.push("needs_fill_with_unsupported_claims");
    usability = "not-usable";
  }

  return {
    sendReady,
    usability,
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

export function buildPrompt({
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

/**
 * The failure-mode glossary is appended rather than inlined so the mode list
 * and its definitions cannot drift apart from the enum the schema accepts.
 *
 * `rubric` is overridable only so calibration can ablate the rubric while
 * holding the glossary and schema fixed, which is what makes a shift in the
 * result attributable to the rubric rather than to losing the mode definitions
 * alongside it. Product runs never pass it.
 */
export function buildJudgeSystemPrompt(
  rubric: string = SEND_READY_SYSTEM_PROMPT,
): string {
  return `${rubric}

## Failure modes

${PRIMARY_ISSUE_MODES.map((mode) => `- ${mode}: ${MODE_DEFINITIONS[mode]}`).join("\n")}`;
}
