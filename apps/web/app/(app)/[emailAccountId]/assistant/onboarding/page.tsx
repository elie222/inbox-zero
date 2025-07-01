"use client";

import useSWR from "swr";
import { Card } from "@/components/ui/card";
import { CategoriesSetup } from "./CategoriesSetup";
import type { GetCategorizationPreferencesResponse } from "@/app/api/user/categorization-preferences/route";
import { LoadingContent } from "@/components/LoadingContent";

export default function OnboardingPage() {
  const {
    data: defaultValues,
    isLoading,
    error,
  } = useSWR<GetCategorizationPreferencesResponse>(
    "/api/user/categorization-preferences",
  );

  return (
    <Card className="my-4 w-full max-w-2xl p-6 sm:mx-4 md:mx-auto">
      <LoadingContent loading={isLoading} error={error}>
        <CategoriesSetup defaultValues={defaultValues || undefined} />
      </LoadingContent>
    </Card>
  );
}
