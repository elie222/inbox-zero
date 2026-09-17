import { redirectToEmailAccountPath } from "@/utils/account";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectToEmailAccountPath("/onboarding", await searchParams);
}
