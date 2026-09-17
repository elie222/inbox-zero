"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChatOnboarding } from "@/app/(app)/[emailAccountId]/onboarding/ChatOnboarding";
import { OnboardingContent } from "@/app/(app)/[emailAccountId]/onboarding/OnboardingContent";
import {
  getOnboardingEntry,
  PAYWALL_FIRST_UPGRADE_PATH,
} from "@/app/(app)/[emailAccountId]/onboarding/onboardingFlow";
import {
  useOnboardingChatVariant,
  useOnboardingPaywallVariant,
  type OnboardingChatVariant,
  type OnboardingPaywallVariant,
} from "@/hooks/useFeatureFlags";
import { usePremium } from "@/hooks/usePremium";

// Two independent A/B gates:
// - "onboarding-paywall-first": "paywall-first" shows pricing before any
//   onboarding step and only lets paying users into the flow. "control" keeps
//   pricing after onboarding.
// - "onboarding-chat": "chat" gets the conversational onboarding, "control"
//   keeps the step-based flow.
// While flags resolve this renders the control flow, which shows nothing until
// its own data loads — so a late flag flip is not visible to the user in
// practice.
// The optional `variant` search param forces a chat arm and `paywallFirst=true`
// forces the paywall arm for previewing/QA where PostHog is unavailable.
export function Onboarding({
  step,
  forcedVariant,
  forcedPaywallFirst,
}: {
  step?: string;
  forcedVariant?: string;
  forcedPaywallFirst?: string;
}) {
  const router = useRouter();
  const { isPremium, isLoading: isPremiumLoading } = usePremium();

  const paywallFlagVariant = useOnboardingPaywallVariant();
  // Only forcing the arm on is honored, so users can't opt out of the paywall
  // by editing the URL.
  const paywallVariant: OnboardingPaywallVariant =
    forcedPaywallFirst === "true" ? "paywall-first" : paywallFlagVariant;

  const flagVariant = useOnboardingChatVariant();
  const variant: OnboardingChatVariant =
    forcedVariant === "chat" || forcedVariant === "control"
      ? forcedVariant
      : flagVariant;

  const entry = getOnboardingEntry({
    paywallVariant,
    isPremium,
    isPremiumLoading,
  });

  useEffect(() => {
    if (entry === "paywall") router.replace(PAYWALL_FIRST_UPGRADE_PATH);
  }, [entry, router]);

  if (entry !== "flow") return null;

  if (variant === "chat") return <ChatOnboarding />;

  return <OnboardingContent step={step} />;
}
