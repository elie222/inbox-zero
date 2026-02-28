import { DraftReplyConfidence } from "@/generated/prisma/enums";

export const DEFAULT_DRAFT_REPLY_CONFIDENCE = DraftReplyConfidence.ALL_EMAILS;

const DRAFT_REPLY_CONFIDENCE_RANK: Record<DraftReplyConfidence, number> = {
  [DraftReplyConfidence.ALL_EMAILS]: 0,
  [DraftReplyConfidence.STANDARD]: 1,
  [DraftReplyConfidence.HIGH_CONFIDENCE]: 2,
};

export const DRAFT_REPLY_CONFIDENCE_OPTIONS = [
  {
    value: DraftReplyConfidence.ALL_EMAILS,
    label: "All emails",
    description: "Draft a reply for every email, even when uncertain.",
  },
  {
    value: DraftReplyConfidence.STANDARD,
    label: "Standard",
    description: "Skip drafting when the AI is unsure how to respond.",
  },
  {
    value: DraftReplyConfidence.HIGH_CONFIDENCE,
    label: "High confidence",
    description: "Only draft when the AI is very sure of the right reply.",
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
