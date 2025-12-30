import { redirectToEmailAccountPath } from "@/utils/account";

export default async function OnboardingBriefPage() {
  await redirectToEmailAccountPath("/onboarding-brief");
}
