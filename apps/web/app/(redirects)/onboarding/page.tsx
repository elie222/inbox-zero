import { redirectToEmailAccountPath } from "@/utils/account";

export default async function OnboardingPage() {
  await redirectToEmailAccountPath("/onboarding");
}
