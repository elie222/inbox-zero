"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { CategoriesSetup } from "./CategoriesSetup";
import type { GetOnboardingPreferencesResponse } from "@/app/api/user/onboarding-preferences/route";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccount } from "@/providers/EmailAccountProvider";

export default function OnboardingPage() {
  const { emailAccountId } = useAccount();

  const { data: defaultValues, isLoading } =
    useSWR<GetOnboardingPreferencesResponse>(
      "/api/user/onboarding-preferences",
    );

  if (isLoading) {
    return (
      <Card className="my-4 w-full max-w-2xl p-6 sm:mx-4 md:mx-auto">
        <div className="space-y-6">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <div className="space-y-4">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
          <Skeleton className="h-12 w-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className="my-4 w-full max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <CategoriesSetup
        emailAccountId={emailAccountId}
        defaultValues={defaultValues || undefined}
      />
    </Card>
  );
}
