import { prefixPath } from "@/utils/path";

export const STEP_KEYS = {
  WELCOME: "welcome",
  CHAT: "chat",
  EMAILS_SORTED: "emailsSorted",
  DRAFT_REPLIES: "draftReplies",
  BULK_UNSUBSCRIBE: "bulkUnsubscribe",
  FEATURES: "features",
  WHO: "who",
  COMPANY_SIZE: "companySize",
  HOW_YOU_HEARD: "howYouHeard",
  LABELS: "labels",
  DRAFT: "draft",
  CUSTOM_RULES: "customRules",
  INVITE_TEAM: "inviteTeam",
  INBOX_PROCESSED: "inboxProcessed",
} as const;

export type StepKey = (typeof STEP_KEYS)[keyof typeof STEP_KEYS];

const onboardingStepOrder: readonly StepKey[] = [
  STEP_KEYS.WELCOME,
  STEP_KEYS.EMAILS_SORTED,
  STEP_KEYS.CHAT,
  STEP_KEYS.DRAFT_REPLIES,
  STEP_KEYS.BULK_UNSUBSCRIBE,
  // STEP_KEYS.FEATURES,
  STEP_KEYS.WHO,
  STEP_KEYS.COMPANY_SIZE,
  STEP_KEYS.HOW_YOU_HEARD,
  STEP_KEYS.LABELS,
  STEP_KEYS.DRAFT,
  STEP_KEYS.CUSTOM_RULES,
  STEP_KEYS.INVITE_TEAM,
  STEP_KEYS.INBOX_PROCESSED,
];

export function getVisibleOnboardingStepKeys({
  canInviteTeam,
  autoDraftDisabled,
}: {
  canInviteTeam: boolean;
  autoDraftDisabled: boolean;
}) {
  return onboardingStepOrder.filter((stepKey) => {
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

export function getOnboardingStepHref(
  emailAccountId: string,
  stepKey: StepKey,
  options?: {
    force?: boolean;
  },
) {
  const searchParams = new URLSearchParams({ step: stepKey });

  if (options?.force) {
    searchParams.set("force", "true");
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

export function isOptionalOnboardingStep(stepKey: StepKey) {
  return stepKey === STEP_KEYS.INVITE_TEAM;
}

function clampStepIndex(stepIndex: number, totalSteps: number) {
  if (totalSteps <= 0) return 0;
  return Math.min(Math.max(stepIndex, 0), totalSteps - 1);
}
