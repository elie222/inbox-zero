export function getWelcomeRedirectPath({
  completedOnboardingAt,
  emailAccountCount,
  forceOnboarding,
}: {
  completedOnboardingAt: Date | string | null;
  emailAccountCount: number;
  forceOnboarding: boolean;
}) {
  if (emailAccountCount === 0) return "/connect-mailbox";
  if (forceOnboarding) return "/onboarding";
  if (completedOnboardingAt) return "/setup";
  return "/onboarding";
}
