import { DraftReplyConfidence } from "@/generated/prisma/enums";

export const DEFAULT_DRAFT_REPLY_CONFIDENCE = DraftReplyConfidence.ALL_EMAILS;

export const DRAFT_REPLY_CONFIDENCE_OPTIONS = [
  {
    value: DraftReplyConfidence.ALL_EMAILS,
    label: "All emails",
    description: "Draft a reply for every email, even when uncertain.",
    minimumThreshold: 0,
  },
  {
    value: DraftReplyConfidence.STANDARD,
    label: "Standard",
    description: "Skip drafting when the AI is unsure how to respond.",
    minimumThreshold: 70,
  },
  {
    value: DraftReplyConfidence.HIGH_CONFIDENCE,
    label: "High confidence",
    description: "Only draft when the AI is very sure of the right reply.",
    minimumThreshold: 90,
  },
] as const;

export function getDraftReplyMinimumThreshold(
  confidence: DraftReplyConfidence | null | undefined,
) {
  return (
    DRAFT_REPLY_CONFIDENCE_OPTIONS.find((option) => option.value === confidence)
      ?.minimumThreshold ?? 0
  );
}

export function getDraftReplyConfidenceOption(
  confidence: DraftReplyConfidence | null | undefined,
) {
  return (
    DRAFT_REPLY_CONFIDENCE_OPTIONS.find(
      (option) => option.value === confidence,
    ) ?? DRAFT_REPLY_CONFIDENCE_OPTIONS[0]
  );
}
