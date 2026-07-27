import { DraftReplyConfidence } from "@/generated/prisma/enums";

export const DEFAULT_DRAFT_REPLY_CONFIDENCE = DraftReplyConfidence.ALL_EMAILS;

const DRAFT_REPLY_CONFIDENCE_RANK: Record<DraftReplyConfidence, number> = {
  [DraftReplyConfidence.ALL_EMAILS]: 0,
  [DraftReplyConfidence.STANDARD]: 1,
  [DraftReplyConfidence.HIGH_CONFIDENCE]: 2,
};

/**
 * Descriptions are deliberately modest about what this gate delivers.
 *
 * Offline evaluation found the drafter's self-reported confidence tracks
 * quality more weakly than the previous copy implied: requiring HIGH improves
 * what gets shown, but not reliably enough to call it an assurance. "Very sure
 * of the right reply" was a promise the model's own label cannot keep.
 *
 * STANDARD is weaker again. It excludes only LOW, which the drafter returns
 * rarely enough that the setting filters very little, so "skip drafting when
 * the AI is unsure how to respond" described something it does not do. Whether
 * the tier should exist at all is a product question this does not settle; the
 * copy at least stops overstating it.
 *
 * Measurements are in the private evals repo, not here.
 */
export const DRAFT_REPLY_CONFIDENCE_OPTIONS = [
  {
    value: DraftReplyConfidence.ALL_EMAILS,
    label: "All emails",
    description: "Draft a reply for every email, even when uncertain.",
  },
  {
    value: DraftReplyConfidence.STANDARD,
    label: "Standard",
    description:
      "Skip the few replies the AI flags as low confidence. In practice this filters very little.",
  },
  {
    value: DraftReplyConfidence.HIGH_CONFIDENCE,
    label: "High confidence",
    description:
      "Only draft when the AI rates its own reply highly. Fewer drafts, and somewhat more of them usable as written.",
  },
] as const;

export function getDraftReplyConfidenceOption(
  confidence: DraftReplyConfidence | null | undefined,
) {
  return (
    DRAFT_REPLY_CONFIDENCE_OPTIONS.find(
      (option) => option.value === confidence,
    ) ?? DRAFT_REPLY_CONFIDENCE_OPTIONS[0]
  );
}

export function normalizeDraftReplyConfidence(
  confidence: unknown,
): DraftReplyConfidence {
  return (
    (typeof confidence === "string" &&
    Object.values(DraftReplyConfidence).includes(
      confidence as DraftReplyConfidence,
    )
      ? (confidence as DraftReplyConfidence)
      : null) ?? DraftReplyConfidence.ALL_EMAILS
  );
}

export function meetsDraftReplyConfidenceRequirement({
  draftConfidence,
  minimumConfidence,
}: {
  draftConfidence: DraftReplyConfidence | null | undefined;
  minimumConfidence: DraftReplyConfidence | null | undefined;
}) {
  if (!minimumConfidence) return true;
  if (!draftConfidence) {
    return minimumConfidence === DraftReplyConfidence.ALL_EMAILS;
  }

  return (
    DRAFT_REPLY_CONFIDENCE_RANK[draftConfidence] >=
    DRAFT_REPLY_CONFIDENCE_RANK[minimumConfidence]
  );
}
