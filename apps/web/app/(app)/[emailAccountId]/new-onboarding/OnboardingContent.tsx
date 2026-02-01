"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { StepWho } from "@/app/(app)/[emailAccountId]/new-onboarding/StepWho";
import { StepEmailsSorted } from "@/app/(app)/[emailAccountId]/new-onboarding/StepEmailsSorted";
import { StepDraftReplies } from "@/app/(app)/[emailAccountId]/new-onboarding/StepDraftReplies";
import { StepBulkUnsubscribe } from "@/app/(app)/[emailAccountId]/new-onboarding/StepBulkUnsubscribe";
import { StepLabels } from "@/app/(app)/[emailAccountId]/new-onboarding/StepLabels";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import { StepFeatures } from "@/app/(app)/[emailAccountId]/new-onboarding/StepFeatures";
import { StepDraft } from "@/app/(app)/[emailAccountId]/new-onboarding/StepDraft";
import { StepCustomRules } from "@/app/(app)/[emailAccountId]/new-onboarding/StepCustomRules";
import { StepInboxProcessed } from "@/app/(app)/[emailAccountId]/new-onboarding/StepInboxProcessed";
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
import { StepCompanySize } from "@/app/(app)/[emailAccountId]/new-onboarding/StepCompanySize";
import { usePremium } from "@/components/PremiumAlert";
import {
  STEP_KEYS,
  STEP_ORDER,
} from "@/app/(app)/[emailAccountId]/new-onboarding/steps";

interface OnboardingContentProps {
  step: number;
}

export function OnboardingContent({ step }: OnboardingContentProps) {
  const { emailAccountId, provider, isLoading } = useAccount();
  const { isPremium } = usePremium();

  useSignUpEvent();

  const stepMap = {
    [STEP_KEYS.EMAILS_SORTED]: () => <StepEmailsSorted onNext={onNext} />,
    [STEP_KEYS.DRAFT_REPLIES]: () => <StepDraftReplies onNext={onNext} />,
    [STEP_KEYS.BULK_UNSUBSCRIBE]: () => <StepBulkUnsubscribe onNext={onNext} />,
    [STEP_KEYS.FEATURES]: () => <StepFeatures onNext={onNext} />,
    [STEP_KEYS.WHO]: () => (
      <StepWho
        initialRole={data?.role || data?.personaAnalysis?.persona}
        emailAccountId={emailAccountId}
        onNext={onNext}
      />
    ),
    [STEP_KEYS.COMPANY_SIZE]: () => <StepCompanySize onNext={onNext} />,
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

  const steps = STEP_ORDER.map((key) => stepMap[key]).filter(isDefined);

  const { data, mutate } = usePersona();

  // Use local state for instant step transitions (no server round-trip)
  const [currentStep, setCurrentStep] = useState(() =>
    Math.min(Math.max(step, 1), steps.length),
  );

  const router = useRouter();
  const analytics = useOnboardingAnalytics("onboarding");

  useEffect(() => {
    analytics.onStart();
  }, [analytics]);

  const onNext = useCallback(() => {
    if (currentStep < steps.length) {
      // Instant client-side transition
      setCurrentStep((prev) => prev + 1);
      // Track analytics in background
      analytics.onNext(currentStep);
    } else {
      // Final step - complete onboarding and redirect
      analytics.onComplete();
      markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
      completedOnboardingAction().then(() => {
        if (isPremium) {
          router.push(prefixPath(emailAccountId, "/setup"));
        } else {
          router.push("/welcome-upgrade");
        }
      });
    }
  }, [router, emailAccountId, analytics, currentStep, steps.length, isPremium]);

  // Trigger persona analysis on mount (first step only)
  useEffect(() => {
    if (currentStep === 1 && !data?.personaAnalysis) {
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
  }, [currentStep, emailAccountId, data?.personaAnalysis, mutate]);

  const renderStep = steps[currentStep - 1] || steps[0];

  // Show loading if provider is needed but not loaded yet
  if (isLoading && !provider) {
    return null;
  }

  return renderStep ? renderStep() : null;
}
