export const STEP_KEYS = {
  INTRO: "intro",
  FEATURES: "features",
  WHO: "who",
  COMPANY_SIZE: "companySize",
  LABELS: "labels",
  DRAFT: "draft",
  CUSTOM_RULES: "customRules",
  INBOX_PROCESSED: "inboxProcessed",
} as const;

export const STEP_ORDER = [
  STEP_KEYS.INTRO,
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
