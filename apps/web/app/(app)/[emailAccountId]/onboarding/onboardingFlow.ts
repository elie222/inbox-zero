import { prefixPath } from "@/utils/path";
import {
  ActionType,
  type SignupIntent,
  SystemType,
} from "@/generated/prisma/enums";

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
  INBOX_PROCESSED: "inboxProcessed",
  INTENT: "intent",
  EMAIL_APP: "emailApp",
} as const;

export type StepKey = (typeof STEP_KEYS)[keyof typeof STEP_KEYS];

// Everyone sees what the product does before any questions. The intent answer
// then decides whether the AI setup steps follow the survey.
const introStepOrder: readonly StepKey[] = [
  STEP_KEYS.WELCOME,
  STEP_KEYS.EMAILS_SORTED,
  STEP_KEYS.CHAT,
  STEP_KEYS.DRAFT_REPLIES,
  STEP_KEYS.BULK_UNSUBSCRIBE,
  STEP_KEYS.EMAIL_APP,
];

const surveyStepOrder: readonly StepKey[] = [
  STEP_KEYS.WHO,
  STEP_KEYS.COMPANY_SIZE,
  STEP_KEYS.HOW_YOU_HEARD,
];

const aiAssistantSetupStepOrder: readonly StepKey[] = [
  STEP_KEYS.LABELS,
  STEP_KEYS.DRAFT,
  STEP_KEYS.CUSTOM_RULES,
  STEP_KEYS.INBOX_PROCESSED,
];

// Frozen pre-intent order so old numeric `?step=N` links keep resolving.
// The removed team step maps to the step after it.
const legacyNumericOnboardingStepOrder: readonly StepKey[] = [
  STEP_KEYS.WELCOME,
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
  mailAppEnabled,
  signupIntent,
}: {
  autoDraftDisabled: boolean;
  emailAppEnabled: boolean;
  isSelfHosted?: boolean;
  mailAppEnabled: boolean;
  signupIntent: SignupIntent | null;
}) {
  // The sales survey is irrelevant for self-hosted deployments.
  const survey = isSelfHosted ? [] : surveyStepOrder;
  // Without the email app there is no choice to make: everyone gets the AI
  // setup. Until the user picks, the AI setup steps stand in as the most common
  // path.
  const intent = mailAppEnabled ? [STEP_KEYS.INTENT] : [];
  const setup =
    mailAppEnabled && signupIntent === "MAIL_CLIENT"
      ? []
      : aiAssistantSetupStepOrder;
  const stepOrder = [...introStepOrder, ...intent, ...survey, ...setup];

  return stepOrder.filter((stepKey) => {
    if (
      autoDraftDisabled &&
      (stepKey === STEP_KEYS.DRAFT_REPLIES || stepKey === STEP_KEYS.DRAFT)
    ) {
      return false;
    }

    if (
      (!emailAppEnabled || !mailAppEnabled) &&
      stepKey === STEP_KEYS.EMAIL_APP
    ) {
      return false;
    }

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
