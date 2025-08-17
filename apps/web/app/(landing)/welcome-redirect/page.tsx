"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useOnboardingVariant } from "@/hooks/useFeatureFlags";

// a/b test between new and old onboarding flow
export default function WelcomeRedirectPage() {
  const router = useRouter();
  const variant = useOnboardingVariant();

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
