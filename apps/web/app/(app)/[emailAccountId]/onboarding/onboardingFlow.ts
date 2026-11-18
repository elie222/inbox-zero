import { prefixPath } from "@/utils/path";
import {
  ActionType,
  type SignupIntent,
  SystemType,
} from "@/generated/prisma/enums";

export const STEP_KEYS = {
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
  INBOX_PROCESSED: "inboxProcessed",
  INTENT: "intent",
  MAIL_APP: "mailApp",
  EMAIL_APP: "emailApp",
} as const;

export type StepKey = (typeof STEP_KEYS)[keyof typeof STEP_KEYS];

// The intent question comes first and picks the branch. Each branch shows
// what the product does before asking the survey questions.
const surveyStepOrder: readonly StepKey[] = [
  STEP_KEYS.WHO,
  STEP_KEYS.COMPANY_SIZE,
  STEP_KEYS.HOW_YOU_HEARD,
];

const aiAssistantTourStepOrder: readonly StepKey[] = [
  STEP_KEYS.EMAILS_SORTED,
  STEP_KEYS.CHAT,
  STEP_KEYS.DRAFT_REPLIES,
  STEP_KEYS.BULK_UNSUBSCRIBE,
  STEP_KEYS.EMAIL_APP,
];

const aiAssistantSetupStepOrder: readonly StepKey[] = [
  STEP_KEYS.LABELS,
  STEP_KEYS.DRAFT,
  STEP_KEYS.CUSTOM_RULES,
  STEP_KEYS.INBOX_PROCESSED,
];

// Frozen pre-intent order so old numeric `?step=N` links keep resolving.
// The removed welcome step is null; the removed team step maps to the step after it.
const legacyNumericOnboardingStepOrder: readonly (StepKey | null)[] = [
  null,
  STEP_KEYS.EMAILS_SORTED,
  STEP_KEYS.CHAT,
  STEP_KEYS.DRAFT_REPLIES,
  STEP_KEYS.BULK_UNSUBSCRIBE,
  STEP_KEYS.WHO,
  STEP_KEYS.COMPANY_SIZE,
  STEP_KEYS.HOW_YOU_HEARD,
  STEP_KEYS.LABELS,
  STEP_KEYS.DRAFT,
  STEP_KEYS.CUSTOM_RULES,
  STEP_KEYS.INBOX_PROCESSED,
  STEP_KEYS.INBOX_PROCESSED,
];

export function getVisibleOnboardingStepKeys({
  autoDraftDisabled,
  emailAppEnabled,
  isSelfHosted,
  signupIntent,
}: {
  autoDraftDisabled: boolean;
  emailAppEnabled: boolean;
  isSelfHosted?: boolean;
  signupIntent: SignupIntent | null;
}) {
  // The sales survey is irrelevant for self-hosted deployments.
  const survey = isSelfHosted ? [] : surveyStepOrder;
  // Until the user picks, the AI branch stands in as the most common path.
  const branchStepOrder =
    signupIntent === "MAIL_CLIENT"
      ? [STEP_KEYS.MAIL_APP, ...survey]
      : [...aiAssistantTourStepOrder, ...survey, ...aiAssistantSetupStepOrder];
  const stepOrder = [STEP_KEYS.INTENT, ...branchStepOrder];

  return stepOrder.filter((stepKey) => {
    if (
      autoDraftDisabled &&
      (stepKey === STEP_KEYS.DRAFT_REPLIES || stepKey === STEP_KEYS.DRAFT)
    ) {
      return false;
    }

    if (!emailAppEnabled && stepKey === STEP_KEYS.EMAIL_APP) return false;

    return true;
  });
}

type RuleDraftState = {
  systemType: SystemType | null;
  actions: readonly { type: ActionType }[];
};

export function isDraftRepliesDisabledByRuleState(
  rules: readonly RuleDraftState[] | undefined,
) {
  const toReplyRule = rules?.find(
    (rule) => rule.systemType === SystemType.TO_REPLY,
  );

  if (!toReplyRule) return false;

  return !toReplyRule.actions.some(
    (action) => action.type === ActionType.DRAFT_EMAIL,
  );
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
    const legacyStepKey = legacyNumericOnboardingStepOrder[numericStep - 1];
    if (legacyStepKey) {
      const legacyStepIndex = visibleStepKeys.indexOf(legacyStepKey);
      if (legacyStepIndex !== -1) return legacyStepIndex;
    }

    return clampStepIndex(numericStep - 1, visibleStepKeys.length);
  }

  const stepIndex = visibleStepKeys.indexOf(stepParam as StepKey);
  return stepIndex === -1 ? 0 : stepIndex;
}

function clampStepIndex(stepIndex: number, totalSteps: number) {
  if (totalSteps <= 0) return 0;
  return Math.min(Math.max(stepIndex, 0), totalSteps - 1);
}
