"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ColdEmailForm } from "@/app/(app)/cold-email-blocker/ColdEmailSettings";

export function OnboardingColdEmailBlocker() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const step = parseInt(searchParams.get("step") || "1");

  return (
    <div>
      <ColdEmailForm
        onSuccess={() => {
          router.push(`/onboarding?step=${step + 1}`);
        }}
      />
    </div>
  );
}
