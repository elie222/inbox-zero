export const STEP_KEYS = {
  EMAILS_SORTED: "emailsSorted",
  DRAFT_REPLIES: "draftReplies",
  BULK_UNSUBSCRIBE: "bulkUnsubscribe",
  FEATURES: "features",
  WHO: "who",
  COMPANY_SIZE: "companySize",
  LABELS: "labels",
  DRAFT: "draft",
  CUSTOM_RULES: "customRules",
  INBOX_PROCESSED: "inboxProcessed",
} as const;

export const STEP_ORDER = [
  STEP_KEYS.EMAILS_SORTED,
  STEP_KEYS.DRAFT_REPLIES,
  STEP_KEYS.BULK_UNSUBSCRIBE,
  STEP_KEYS.FEATURES,
  STEP_KEYS.WHO,
  STEP_KEYS.COMPANY_SIZE,
  STEP_KEYS.LABELS,
  STEP_KEYS.DRAFT,
  STEP_KEYS.CUSTOM_RULES,
  STEP_KEYS.INBOX_PROCESSED,
] as const;

export function getStepNumber(
  stepKey: (typeof STEP_KEYS)[keyof typeof STEP_KEYS],
): number {
  const index = STEP_ORDER.indexOf(stepKey);
  return index === -1 ? 1 : index + 1;
}
