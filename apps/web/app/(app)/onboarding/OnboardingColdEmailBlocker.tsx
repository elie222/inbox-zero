"use client";

import { useRouter } from "next/navigation";
import { ColdEmailForm } from "@/app/(app)/cold-email-blocker/ColdEmailSettings";
import { useUser } from "@/hooks/useUser";
import { LoadingContent } from "@/components/LoadingContent";

export function OnboardingColdEmailBlocker({ step }: { step: number }) {
  const router = useRouter();
  const { data, isLoading, error } = useUser();

  return (
    <div>
      <LoadingContent loading={isLoading} error={error}>
        <ColdEmailForm
          coldEmailBlocker={data?.coldEmailBlocker}
          buttonText="Next"
          onSuccess={() => {
            router.push(`/onboarding?step=${step + 1}`, { scroll: false });
          }}
        />
      </LoadingContent>
    </div>
  );
}
