"use client";

import { useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Trans } from "@lingui/react/macro";
import { ArrowRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepWelcome } from "@/app/(app)/[emailAccountId]/onboarding/StepWelcome";
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
import { useOnboardingAnalytics } from "@/hooks/useAnalytics";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useSignUpEvent } from "@/hooks/useSignupEvent";
import { isDefined } from "@/utils/types";
import { env } from "@/env";
import { useCompleteOnboarding } from "@/app/(app)/[emailAccountId]/onboarding/useCompleteOnboarding";
import { StepCompanySize } from "@/app/(app)/[emailAccountId]/onboarding/StepCompanySize";
import { StepHowYouHeard } from "@/app/(app)/[emailAccountId]/onboarding/StepHowYouHeard";
import { useRules } from "@/hooks/useRules";
import {
  getOnboardingStepHref,
  getOnboardingStepIndex,
  getVisibleOnboardingStepKeys,
  isDraftRepliesDisabledByRuleState,
  STEP_KEYS,
  type StepKey,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import { StepIntent } from "@/app/(app)/[emailAccountId]/onboarding/StepIntent";
import { StepMailApp } from "@/app/(app)/[emailAccountId]/onboarding/StepMailApp";
import type { SignupIntent } from "@/generated/prisma/enums";

interface OnboardingContentProps {
  signupIntent: SignupIntent | null;
  step?: string;
}

export function OnboardingContent({
  step,
  signupIntent,
}: OnboardingContentProps) {
  const { emailAccountId, provider, isLoading } = useAccount();
  const { data: rules, isLoading: isRulesLoading } = useRules(emailAccountId);

  useSignUpEvent();

  const stepMap: Record<string, (() => React.ReactNode) | undefined> = {
    [STEP_KEYS.WELCOME]: () => <StepWelcome onNext={onNext} />,
    [STEP_KEYS.CHAT]: () => <StepChat onNext={onNext} />,
    [STEP_KEYS.EMAILS_SORTED]: () => <StepEmailsSorted onNext={onNext} />,
    [STEP_KEYS.DRAFT_REPLIES]: () => <StepDraftReplies onNext={onNext} />,
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
    [STEP_KEYS.INTENT]: () => <StepIntent onIntentSaved={onIntentSaved} />,
    [STEP_KEYS.EMAIL_APP]: () => <StepMailApp onNext={onNext} />,
    [STEP_KEYS.LABELS]: () => (
      <StepLabels
        provider={provider}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.DRAFT]: () => (
      <StepDraft
        provider={provider}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.CUSTOM_RULES]: () => (
      <StepCustomRules provider={provider} onNext={onNext} />
    ),
    [STEP_KEYS.INBOX_PROCESSED]: () => <StepInboxProcessed onNext={onNext} />,
  };

  const isSelfHosted = Boolean(env.NEXT_PUBLIC_BYPASS_PREMIUM_CHECKS);

  const getVisibleStepKeys = (intent: SignupIntent | null) =>
    getVisibleOnboardingStepKeys({
      autoDraftDisabled:
        Boolean(env.NEXT_PUBLIC_AUTO_DRAFT_DISABLED) ||
        isDraftRepliesDisabledByRuleState(rules),
      emailAppEnabled: env.NEXT_PUBLIC_EMAIL_SEND_ENABLED,
      isSelfHosted,
      signupIntent: intent,
    }).filter((key) => isDefined(stepMap[key]));
  const visibleStepKeys = getVisibleStepKeys(signupIntent);
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
  const { completeAndRedirect, destination } =
    useCompleteOnboarding(signupIntent);

  const getOnboardingStepPath = useCallback(
    (stepKey: string) =>
      getOnboardingStepHref(emailAccountId, stepKey as StepKey),
    [emailAccountId],
  );

  useEffect(() => {
    // Wait for step inputs before firing — totalSteps can be wrong while loading.
    if (isRulesLoading || !currentStepKey) return;

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
    });
  }, [analytics, clampedStep, currentStepKey, isRulesLoading, totalSteps]);

  const onNext = useCallback(async () => {
    if (!currentStepKey) return;

    analytics.onNext({
      step: clampedStep,
      stepKey: currentStepKey,
      totalSteps,
      nextStep: clampedStep < steps.length ? clampedStep + 1 : undefined,
      nextStepKey,
    });

    if (clampedStep < steps.length) {
      if (!nextStepKey) return;

      router.push(getOnboardingStepPath(nextStepKey));
    } else {
      analytics.onComplete({
        step: clampedStep,
        stepKey: currentStepKey,
        totalSteps,
        destination,
      });
      await completeAndRedirect();
    }
  }, [
    router,
    analytics,
    clampedStep,
    currentStepKey,
    totalSteps,
    nextStepKey,
    steps.length,
    destination,
    completeAndRedirect,
    getOnboardingStepPath,
  ]);

  const onSkipOnboarding = useCallback(async () => {
    analytics.onComplete({
      step: clampedStep,
      stepKey: currentStepKey ?? "unknown",
      totalSteps,
      destination,
    });
    await completeAndRedirect();
  }, [
    analytics,
    clampedStep,
    currentStepKey,
    totalSteps,
    destination,
    completeAndRedirect,
  ]);

  // The chosen intent decides which branch follows, so the next step is
  // resolved against the new intent rather than the one this render used.
  const onIntentSaved = (intent: SignupIntent) => {
    const stepKeys = getVisibleStepKeys(intent);
    const intentStepIndex = stepKeys.indexOf(STEP_KEYS.INTENT);
    const nextKey = stepKeys[intentStepIndex + 1];

    analytics.onNext({
      step: intentStepIndex + 1,
      stepKey: STEP_KEYS.INTENT,
      totalSteps: stepKeys.length,
      nextStep: intentStepIndex + 2,
      nextStepKey: nextKey,
    });

    if (nextKey) router.push(getOnboardingStepPath(nextKey));
    else completeAndRedirect(intent);
  };

  useEffect(() => {
    if (clampedStep !== 1 || data?.personaAnalysis) return;

    let disposed = false;
    analyzePersonaAction(emailAccountId)
      .then(() => {
        // Navigation can dispose the account's SWR cache before analysis finishes.
        if (!disposed) return mutate();
      })
      .catch((error) => {
        console.error("Failed to analyze persona:", error);
      });

    return () => {
      disposed = true;
    };
  }, [clampedStep, emailAccountId, data?.personaAnalysis, mutate]);

  const renderStep = steps[currentStepIndex] || steps[0];

  // Wait for the inputs that determine which steps are visible before rendering.
  if ((isLoading && !provider) || isRulesLoading) {
    return null;
  }

  return (
    <div className="relative">
      {isSelfHosted && (
        <div className="absolute top-4 right-4 z-50">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={onSkipOnboarding}
          >
            <Trans>Skip onboarding</Trans>
            <ArrowRightIcon className="ml-1 size-3" />
          </Button>
        </div>
      )}
      {/* Start ingesting provider email stats into the database after a slight delay
          so it doesn't race against initial persona analysis on Step 1 */}
      <EmailStatsPreloader delayMs={2000} />
      {renderStep ? renderStep() : null}
    </div>
  );
}
