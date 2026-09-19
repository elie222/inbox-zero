import { getServerFeatureFlagVariant } from "@/utils/posthog";
import prisma from "@/utils/prisma";

const ONBOARDING_PAYWALL_FLAG = "onboarding-paywall-first";
const CONTROL_VARIANT = "control";
const PAYWALL_FIRST_VARIANT = "paywall-first";

type OnboardingPaywallVariant =
  | typeof CONTROL_VARIANT
  | typeof PAYWALL_FIRST_VARIANT;

// The paywall-first experiment arm shows pricing before any onboarding step.
// Decided on the server so the page either redirects or renders the flow;
// there is no client-side wait on flags. `forced` is the `paywallFirst=true`
// QA override; only forcing the arm on is honored so users can't opt out.
export async function shouldShowPaywallFirst({
  userId,
  email,
  isPremium,
  forced,
  storedVariant,
}: {
  userId: string;
  email: string;
  isPremium: boolean;
  forced?: string;
  storedVariant?: string | null;
}) {
  if (isPremium) return false;
  if (forced === "true") return true;

  const existingVariant = getOnboardingPaywallVariant(storedVariant);
  if (existingVariant) return existingVariant === PAYWALL_FIRST_VARIANT;

  const evaluatedVariant = getOnboardingPaywallVariant(
    await getServerFeatureFlagVariant({
      key: ONBOARDING_PAYWALL_FLAG,
      distinctId: email,
    }),
  );
  const variant = evaluatedVariant ?? CONTROL_VARIANT;

  const assignment = await prisma.user.updateMany({
    where: { id: userId, onboardingPaywallVariant: null },
    data: { onboardingPaywallVariant: variant },
  });
  if (assignment.count > 0) return variant === PAYWALL_FIRST_VARIANT;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingPaywallVariant: true },
  });
  return (
    (getOnboardingPaywallVariant(user?.onboardingPaywallVariant) ?? variant) ===
    PAYWALL_FIRST_VARIANT
  );
}

function getOnboardingPaywallVariant(
  variant: string | null | undefined,
): OnboardingPaywallVariant | null {
  if (variant === CONTROL_VARIANT || variant === PAYWALL_FIRST_VARIANT) {
    return variant;
  }
  return null;
}
