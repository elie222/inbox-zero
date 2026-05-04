"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepChat } from "@/app/(app)/[emailAccountId]/onboarding/StepChat";
import { StepEmailsSorted } from "@/app/(app)/[emailAccountId]/onboarding/StepEmailsSorted";
import { StepDraftReplies } from "@/app/(app)/[emailAccountId]/onboarding/StepDraftReplies";
import { StepBulkUnsubscribe } from "@/app/(app)/[emailAccountId]/onboarding/StepBulkUnsubscribe";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import { StepDraft } from "@/app/(app)/[emailAccountId]/onboarding/StepDraft";
import { StepCustomRules } from "@/app/(app)/[emailAccountId]/onboarding/StepCustomRules";
import { StepInboxProcessed } from "@/app/(app)/[emailAccountId]/onboarding/StepInboxProcessed";
import {
  ASSISTANT_ONBOARDING_COOKIE,
  markOnboardingAsCompleted,
} from "@/utils/cookies";
import { completedOnboardingAction } from "@/utils/actions/onboarding";
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useSignUpEvent } from "@/hooks/useSignupEvent";
import { isDefined } from "@/utils/types";
import { env } from "@/env";
import { StepCompanySize } from "@/app/(app)/[emailAccountId]/onboarding/StepCompanySize";
import { StepHowYouHeard } from "@/app/(app)/[emailAccountId]/onboarding/StepHowYouHeard";
import { StepInviteTeam } from "@/app/(app)/[emailAccountId]/onboarding/StepInviteTeam";
import { toastError } from "@/components/Toast";
import { usePremium } from "@/hooks/usePremium";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import {
  getOnboardingStepHref,
  getOnboardingStepIndex,
  getVisibleOnboardingStepKeys,
  isOptionalOnboardingStep,
  STEP_KEYS,
  type StepKey,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import { captureException, getActionErrorMessage } from "@/utils/error";

interface OnboardingContentProps {
  step?: string;
}

export function OnboardingContent({ step }: OnboardingContentProps) {
  const { emailAccountId, provider, isLoading } = useAccount();
  const { isPremium } = usePremium();
  const { data: membership, isLoading: isMembershipLoading } =
    useOrganizationMembership();

  useSignUpEvent();

  const canInviteTeam = Boolean(
    (membership?.isOwner && membership?.organizationId) ||
      (!membership?.organizationId && !membership?.hasPendingInvitationToOrg),
  );

  const stepMap: Record<string, (() => React.ReactNode) | undefined> = {
    [STEP_KEYS.CHAT]: () => <StepChat onNext={onNext} />,
    [STEP_KEYS.EMAILS_SORTED]: () => <StepEmailsSorted onNext={onNext} />,
    [STEP_KEYS.DRAFT_REPLIES]: env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED
      ? undefined
      : () => <StepDraftReplies onNext={onNext} />,
    [STEP_KEYS.BULK_UNSUBSCRIBE]: () => <StepBulkUnsubscribe onNext={onNext} />,
    [STEP_KEYS.WHO]: () => (
      <StepWho
        initialRole={data?.role || data?.personaAnalysis?.persona}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.COMPANY_SIZE]: () => <StepCompanySize onNext={onNext} />,
    [STEP_KEYS.HOW_YOU_HEARD]: () => <StepHowYouHeard onNext={onNext} />,
    [STEP_KEYS.LABELS]: () => (
      <StepLabels
        provider={provider}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.DRAFT]: env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED
      ? undefined
      : () => (
          <StepDraft
            provider={provider}
            emailAccountId={emailAccountId}
            onNext={onNext}
          />
        ),
    [STEP_KEYS.CUSTOM_RULES]: () => (
      <StepCustomRules provider={provider} onNext={onNext} />
    ),
    [STEP_KEYS.INVITE_TEAM]: canInviteTeam
      ? () => (
          <StepInviteTeam
            emailAccountId={emailAccountId}
            organizationId={membership?.organizationId ?? undefined}
            userName={membership?.userName}
            onNext={onNext}
            onSkip={onSkipInviteTeam}
          />
        )
      : undefined,
    [STEP_KEYS.INBOX_PROCESSED]: () => <StepInboxProcessed onNext={onNext} />,
  };

  const visibleStepKeys = getVisibleOnboardingStepKeys({
    canInviteTeam,
    autoDraftDisabled: Boolean(env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED),
  }).filter((key) => isDefined(stepMap[key]));
  const steps = visibleStepKeys.map((key) => stepMap[key]).filter(isDefined);

  const { data, mutate } = usePersona();
  const currentStepIndex = getOnboardingStepIndex(step, visibleStepKeys);
  const clampedStep = currentStepIndex + 1;
  const totalSteps = visibleStepKeys.length;
  const currentStepKey = visibleStepKeys[currentStepIndex];
  const nextStepKey = visibleStepKeys[currentStepIndex + 1];

  const router = useRouter();
  const analytics = useOnboardingAnalytics("onboarding");
  const hasTrackedStart = useRef(false);
  const { executeAsync: completeOnboarding } = useAction(
    completedOnboardingAction,
  );

  const getOnboardingStepPath = useCallback(
    (stepKey: string) =>
      getOnboardingStepHref(emailAccountId, stepKey as StepKey),
    [emailAccountId],
  );

  useEffect(() => {
    // Wait for membership data before firing — totalSteps can be wrong while loading
    if (isMembershipLoading || !currentStepKey) return;

    if (clampedStep === 1 && !hasTrackedStart.current) {
      hasTrackedStart.current = true;
      analytics.onStart({
        step: clampedStep,
        stepKey: currentStepKey,
        totalSteps,
      });
    }

    analytics.onStepViewed({
      step: clampedStep,
      stepKey: currentStepKey,
      totalSteps,
      isOptional: isOptionalOnboardingStep(currentStepKey),
    });
  }, [analytics, clampedStep, currentStepKey, isMembershipLoading, totalSteps]);

  const onNext = useCallback(async () => {
    if (!currentStepKey) return;

    analytics.onNext({
      step: clampedStep,
      stepKey: currentStepKey,
      totalSteps,
      nextStep: clampedStep < steps.length ? clampedStep + 1 : undefined,
      nextStepKey,
      isOptional: isOptionalOnboardingStep(currentStepKey),
    });

    if (clampedStep < steps.length) {
      if (!nextStepKey) return;

      router.push(getOnboardingStepPath(nextStepKey));
    } else {
      analytics.onComplete({
        step: clampedStep,
        stepKey: currentStepKey,
        totalSteps,
        destination: isPremium ? "setup" : "welcome-upgrade",
      });
      markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
      let result: Awaited<ReturnType<typeof completeOnboarding>>;
      try {
        result = await completeOnboarding();
      } catch (error) {
        captureException(error, {
          extra: {
            context: "onboarding",
            step: "complete",
            destination: isPremium ? "setup" : "welcome-upgrade",
          },
        });
        toastError({
          description: getActionErrorMessage(
            {},
            {
              prefix: "There was an error finishing onboarding",
            },
          ),
        });
        return;
      }
      if (result?.serverError || result?.validationErrors) {
        captureException(new Error("Failed to complete onboarding"), {
          extra: {
            context: "onboarding",
            step: "complete",
            serverError: result?.serverError,
            validationErrors: result?.validationErrors,
            destination: isPremium ? "setup" : "welcome-upgrade",
          },
        });
        toastError({
          description: getActionErrorMessage(
            {
              serverError: result?.serverError,
              validationErrors: result?.validationErrors,
            },
            {
              prefix: "There was an error finishing onboarding",
            },
          ),
        });
        return;
      }
      if (isPremium) {
        router.push(prefixPath(emailAccountId, "/setup"));
      } else {
        router.push("/welcome-upgrade");
      }
    }
  }, [
    router,
    emailAccountId,
    analytics,
    clampedStep,
    currentStepKey,
    totalSteps,
    nextStepKey,
    steps.length,
    isPremium,
    completeOnboarding,
    getOnboardingStepPath,
  ]);

  const onSkipInviteTeam = useCallback(() => {
    if (!currentStepKey) return;

    analytics.onSkip({
      step: clampedStep,
      stepKey: currentStepKey,
      totalSteps,
      nextStep: clampedStep < steps.length ? clampedStep + 1 : undefined,
      nextStepKey,
      isOptional: true,
    });

    // Navigate directly — do not call onNext() which would also fire completion analytics.
    if (!nextStepKey) return;

    router.push(getOnboardingStepPath(nextStepKey));
  }, [
    analytics,
    router,
    clampedStep,
    currentStepKey,
    totalSteps,
    nextStepKey,
    steps.length,
    getOnboardingStepPath,
  ]);

  // Trigger persona analysis on mount (first step only)
  useEffect(() => {
    if (clampedStep === 1 && !data?.personaAnalysis) {
      // Run persona analysis in the background
      analyzePersonaAction(emailAccountId)
        .then(() => {
          mutate();
        })
        .catch((error) => {
          // Fail silently - persona analysis is optional enhancement
          console.error("Failed to analyze persona:", error);
        });
    }
  }, [clampedStep, emailAccountId, data?.personaAnalysis, mutate]);

  const renderStep = steps[currentStepIndex] || steps[0];

  // Show loading if provider is needed but not loaded yet
  if (isLoading && !provider) {
    return null;
  }

  // Wait for membership data to load before determining steps
  if (isMembershipLoading) {
    return null;
  }

  return renderStep ? renderStep() : null;
}
