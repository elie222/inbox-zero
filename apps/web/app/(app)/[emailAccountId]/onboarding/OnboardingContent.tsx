"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { StepWho } from "@/app/(app)/[emailAccountId]/onboarding/StepWho";
import { StepIntro } from "@/app/(app)/[emailAccountId]/onboarding/StepIntro";
import { StepLabels } from "@/app/(app)/[emailAccountId]/onboarding/StepLabels";
import { usePersona } from "@/hooks/usePersona";
import { analyzePersonaAction } from "@/utils/actions/email-account";
import { StepFeatures } from "@/app/(app)/[emailAccountId]/onboarding/StepFeatures";
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
import { StepCompanySize } from "@/app/(app)/[emailAccountId]/onboarding/StepCompanySize";
import { StepInviteTeam } from "@/app/(app)/[emailAccountId]/onboarding/StepInviteTeam";
import { usePremium } from "@/components/PremiumAlert";
import { useOrganizationMembership } from "@/hooks/useOrganizationMembership";
import {
  STEP_KEYS,
  STEP_ORDER,
} from "@/app/(app)/[emailAccountId]/onboarding/steps";

interface OnboardingContentProps {
  step: number;
}

export function OnboardingContent({ step }: OnboardingContentProps) {
  const { emailAccountId, provider, isLoading } = useAccount();
  const { isPremium } = usePremium();
  const { data: membership, isLoading: isMembershipLoading } =
    useOrganizationMembership();

  useSignUpEvent();

  const isOrgOwner = membership?.isOwner === true;
  const hasPendingInvitationToOrg =
    membership?.hasPendingInvitationToOrg === true;
  const canInviteTeam =
    (isOrgOwner && membership?.organizationId) ||
    (!membership?.organizationId && !hasPendingInvitationToOrg);

  const stepMap: Record<string, (() => React.ReactNode) | undefined> = {
    [STEP_KEYS.INTRO]: () => <StepIntro onNext={onNext} />,
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
    [STEP_KEYS.INVITE_TEAM]: canInviteTeam
      ? () => (
          <StepInviteTeam
            emailAccountId={emailAccountId}
            organizationId={membership?.organizationId ?? undefined}
            userName={membership?.userName}
            onNext={onNext}
          />
        )
      : undefined,
    [STEP_KEYS.INBOX_PROCESSED]: () => <StepInboxProcessed onNext={onNext} />,
  };

  const steps = STEP_ORDER.map((key) => stepMap[key]).filter(isDefined);

  const { data, mutate } = usePersona();
  const clampedStep = Math.min(Math.max(step, 1), steps.length);

  const router = useRouter();
  const analytics = useOnboardingAnalytics("onboarding");

  useEffect(() => {
    analytics.onStart();
  }, [analytics]);

  const onNext = useCallback(async () => {
    analytics.onNext(clampedStep);
    if (clampedStep < steps.length) {
      router.push(
        prefixPath(emailAccountId, `/onboarding?step=${clampedStep + 1}`),
      );
    } else {
      analytics.onComplete();
      markOnboardingAsCompleted(ASSISTANT_ONBOARDING_COOKIE);
      await completedOnboardingAction();
      if (isPremium) {
        router.push(prefixPath(emailAccountId, "/setup"));
      } else {
        router.push("/welcome-upgrade");
      }
    }
  }, [router, emailAccountId, analytics, clampedStep, steps.length, isPremium]);

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

  const renderStep = steps[clampedStep - 1] || steps[0];

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
