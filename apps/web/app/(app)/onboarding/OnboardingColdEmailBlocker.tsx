"use client";

import { useRouter } from "next/navigation";
import { ColdEmailForm } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailSettings";
import { useEmailAccountFull } from "@/hooks/useEmailAccountFull";
import { LoadingContent } from "@/components/LoadingContent";

export function OnboardingColdEmailBlocker({ step }: { step: number }) {
  const router = useRouter();
  const { data, isLoading, error } = useEmailAccountFull();

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
