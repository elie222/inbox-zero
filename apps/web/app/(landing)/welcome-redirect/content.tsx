import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingVariant } from "@/hooks/useFeatureFlags";

export function WelcomeRedirectContent() {
  const router = useRouter();
  const variant = useOnboardingVariant();

  // a/b test between new and old onboarding flow
  useEffect(() => {
    if (variant === "new-onboarding") {
      // Redirect to the new onboarding flow
      router.push("/onboarding");
    } else {
      // Redirect to the old welcome flow
      router.push("/welcome");
    }
  }, [variant, router]);

  return null;
}
