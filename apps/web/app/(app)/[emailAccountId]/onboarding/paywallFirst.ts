import { getServerFeatureFlagVariant } from "@/utils/posthog";

const ONBOARDING_PAYWALL_FLAG = "onboarding-paywall-first";

// The paywall-first experiment arm shows pricing before any onboarding step.
// Decided on the server so the page either redirects or renders the flow;
// there is no client-side wait on flags. `forced` is the `paywallFirst=true`
// QA override; only forcing the arm on is honored so users can't opt out.
export async function shouldShowPaywallFirst({
  email,
  isPremium,
  forced,
}: {
  email: string;
  isPremium: boolean;
  forced?: string;
}) {
  if (isPremium) return false;
  if (forced === "true") return true;

  const variant = await getServerFeatureFlagVariant({
    key: ONBOARDING_PAYWALL_FLAG,
    distinctId: email,
  });
  return variant === "paywall-first";
}
