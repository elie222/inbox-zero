import { prefixPath } from "@/utils/path";

export const STEP_KEYS = {
  WELCOME: "welcome",
  EMAILS_SORTED: "emailsSorted",
  DRAFT_REPLIES: "draftReplies",
  BULK_UNSUBSCRIBE: "bulkUnsubscribe",
  FEATURES: "features",
  WHO: "who",
  COMPANY_SIZE: "companySize",
  LABELS: "labels",
  DRAFT: "draft",
  CUSTOM_RULES: "customRules",
  INVITE_TEAM: "inviteTeam",
  INBOX_PROCESSED: "inboxProcessed",
} as const;

export const ONBOARDING_FLOW_VARIANTS = {
  CONTROL: "control",
  FAST_5: "fast-5",
} as const;

export type StepKey = (typeof STEP_KEYS)[keyof typeof STEP_KEYS];
export type OnboardingFlowVariant =
  (typeof ONBOARDING_FLOW_VARIANTS)[keyof typeof ONBOARDING_FLOW_VARIANTS];

const flowStepOrders: Record<OnboardingFlowVariant, readonly StepKey[]> = {
  [ONBOARDING_FLOW_VARIANTS.CONTROL]: [
    STEP_KEYS.WELCOME,
    STEP_KEYS.EMAILS_SORTED,
    STEP_KEYS.DRAFT_REPLIES,
    STEP_KEYS.BULK_UNSUBSCRIBE,
    STEP_KEYS.FEATURES,
    STEP_KEYS.WHO,
    STEP_KEYS.COMPANY_SIZE,
    STEP_KEYS.LABELS,
    STEP_KEYS.DRAFT,
    STEP_KEYS.CUSTOM_RULES,
    STEP_KEYS.INVITE_TEAM,
    STEP_KEYS.INBOX_PROCESSED,
  ],
  [ONBOARDING_FLOW_VARIANTS.FAST_5]: [
    STEP_KEYS.WHO,
    STEP_KEYS.COMPANY_SIZE,
    STEP_KEYS.LABELS,
    STEP_KEYS.DRAFT,
    STEP_KEYS.INBOX_PROCESSED,
  ],
};

export function getVisibleOnboardingStepKeys({
  flowVariant,
  canInviteTeam,
  autoDraftDisabled,
}: {
  flowVariant: OnboardingFlowVariant;
  canInviteTeam: boolean;
  autoDraftDisabled: boolean;
}) {
  return flowStepOrders[flowVariant].filter((stepKey) => {
    if (
      autoDraftDisabled &&
      (stepKey === STEP_KEYS.DRAFT_REPLIES || stepKey === STEP_KEYS.DRAFT)
    ) {
      return false;
    }

    if (!canInviteTeam && stepKey === STEP_KEYS.INVITE_TEAM) {
      return false;
    }

    return true;
  });
}

export function getOnboardingFlowVariant(
  variantParam: string | undefined,
): OnboardingFlowVariant | undefined {
  if (!variantParam) return undefined;

  const variants = Object.values(ONBOARDING_FLOW_VARIANTS);
  return variants.find((variant) => variant === variantParam);
}

export function getOnboardingStepHref(
  emailAccountId: string,
  stepKey: StepKey,
  options?: {
    force?: boolean;
    variant?: OnboardingFlowVariant;
  },
) {
  const searchParams = new URLSearchParams({ step: stepKey });

  if (options?.force) {
    searchParams.set("force", "true");
  }

  if (options?.variant) {
    searchParams.set("variant", options.variant);
  }

  return prefixPath(emailAccountId, `/onboarding?${searchParams.toString()}`);
}

export function getOnboardingStepIndex(
  stepParam: string | undefined,
  visibleStepKeys: readonly StepKey[],
) {
  if (!stepParam) return 0;

  const numericStep = Number.parseInt(stepParam, 10);
  if (Number.isFinite(numericStep)) {
    return clampStepIndex(numericStep - 1, visibleStepKeys.length);
  }

  const stepIndex = visibleStepKeys.indexOf(stepParam as StepKey);
  return stepIndex === -1 ? 0 : stepIndex;
}

export function getOnboardingStepNumber({
  stepKey,
  flowVariant,
  canInviteTeam,
  autoDraftDisabled,
}: {
  stepKey: StepKey;
  flowVariant: OnboardingFlowVariant;
  canInviteTeam: boolean;
  autoDraftDisabled: boolean;
}) {
  const visibleStepKeys = getVisibleOnboardingStepKeys({
    flowVariant,
    canInviteTeam,
    autoDraftDisabled,
  });

  const stepIndex = visibleStepKeys.indexOf(stepKey);
  return stepIndex === -1 ? 1 : stepIndex + 1;
}

export function isOptionalOnboardingStep(stepKey: StepKey) {
  return stepKey === STEP_KEYS.INVITE_TEAM;
}

function clampStepIndex(stepIndex: number, totalSteps: number) {
  if (totalSteps <= 0) return 0;
  return Math.min(Math.max(stepIndex, 0), totalSteps - 1);
}
