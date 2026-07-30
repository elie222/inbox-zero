/**
 * Draft edit failure taxonomy.
 *
 * The send-ready rate says how often the product is good enough. This says why
 * it is not. A pass rate with no taxonomy tells you that you are at 62% and
 * nothing about what to fix.
 *
 * Mode names are shared with the production mining pipeline that classifies
 * real draft-vs-sent pairs, so an eval failure histogram and a production
 * failure histogram are directly comparable.
 */
export const EDIT_FAILURE_MODES = [
  "VERBOSE_PADDING",
  "OVER_HEDGING",
  "MISSING_FACT",
  "FACTUAL_CORRECTION",
  "WRONG_COMMITMENT",
  "WRONG_REGISTER",
  "GREETING_SIGNOFF_ONLY",
  "STRUCTURE_ONLY",
  "UNNECESSARY_QUESTION",
  "MISSED_ASK",
  "WRONG_LANGUAGE",
  "FULL_REWRITE",
  "NO_MEANINGFUL_EDIT",
] as const;

export type EditFailureMode = (typeof EDIT_FAILURE_MODES)[number];

export const EDIT_SEVERITIES = ["none", "minor", "major", "total"] as const;

/**
 * A draft that leaves an honest gap for the user to fill is not the same
 * product outcome as one that invents the missing fact, but a binary
 * send-ready flag scores them identically. Separating them is what makes the
 * "use a placeholder when you do not know" strategy measurable: it should
 * convert not-usable drafts into needs-fill ones without inventing anything.
 */
export const USABILITY_OUTCOMES = [
  "send-ready",
  "needs-fill",
  "not-usable",
] as const;

export const MODE_DEFINITIONS: Record<EditFailureMode, string> = {
  VERBOSE_PADDING:
    "The user cut filler, restatement, or over-explanation. The core message of the draft survived, just shorter.",
  OVER_HEDGING:
    "The user removed unnecessary caveats, apologies, softeners, or qualifiers.",
  MISSING_FACT:
    "The user ADDED substantive information the draft did not have. Signals a context/retrieval failure.",
  FACTUAL_CORRECTION:
    "The user fixed something the draft asserted incorrectly. Signals hallucination.",
  WRONG_COMMITMENT:
    "The draft committed to a time, price, deliverable, or promise that the user changed, softened, or removed.",
  WRONG_REGISTER:
    "Formality, warmth, or voice mismatch with how this user writes. Same content, different tone.",
  GREETING_SIGNOFF_ONLY:
    "Cosmetic only: salutation, closing, or signature block changed. Body untouched.",
  STRUCTURE_ONLY:
    "Same content and same tone, but reordered, reformatted, merged, or split.",
  UNNECESSARY_QUESTION:
    "The draft asked the recipient something that was already answerable from the thread or context.",
  MISSED_ASK:
    "The draft failed to answer or address what the incoming message actually asked for.",
  WRONG_LANGUAGE: "The draft was written in the wrong natural language.",
  FULL_REWRITE:
    "The user discarded the draft and wrote something substantively unrelated.",
  NO_MEANINGFUL_EDIT:
    "The user effectively accepted the draft. Only trivial whitespace, punctuation, or single-word changes.",
};
