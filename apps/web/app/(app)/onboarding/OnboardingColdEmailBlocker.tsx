"use client";

import { useRouter } from "next/navigation";
import { ColdEmailForm } from "@/app/(app)/cold-email-blocker/ColdEmailSettings";

export function OnboardingColdEmailBlocker({ step }: { step: number }) {
  const router = useRouter();

  return (
    <div>
      <ColdEmailForm
        buttonText="Next"
        onSuccess={() => {
          router.push(`/onboarding?step=${step + 1}`, { scroll: false });
        }}
      />
    </div>
  );
}
