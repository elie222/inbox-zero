"use client";

import { useMemo, useCallback } from "react";
import useSWR from "swr";
import { AutoCategorizationSetup } from "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup";
import { BulkArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress";
import { BulkArchiveCards } from "@/components/BulkArchiveCards";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import type { CategorizedSendersResponse } from "@/app/api/user/categorize/senders/categorized/route";
import type { CategoryWithRules } from "@/utils/category.server";
import { useSearchParams } from "next/navigation";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";

type Sender = {
  id: string;
  email: string;
  category: { id: string; description: string | null; name: string } | null;
};

export function BulkArchive({
  initialSenders,
  initialCategories,
}: {
  initialSenders: Sender[];
  initialCategories: CategoryWithRules[];
}) {
  const searchParams = useSearchParams();
  const onboarding = searchParams.get("onboarding");
  const hasCategorizedSenders = initialSenders.length > 0;
  const showOnboarding = onboarding === "true" || !hasCategorizedSenders;

  const { isBulkCategorizing } = useCategorizeProgress();

  // Poll for updates while categorization is in progress
  const { data, mutate } = useSWR<CategorizedSendersResponse>(
    "/api/user/categorize/senders/categorized",
    {
      refreshInterval: isBulkCategorizing ? 2000 : undefined,
      fallbackData: { senders: initialSenders, categories: initialCategories },
    },
  );

  // Use SWR data if available, otherwise fall back to initial server data
  const senders = data?.senders ?? initialSenders;
  const categories = data?.categories ?? initialCategories;

  const emailGroups = useMemo(
    () =>
      senders.map((sender) => ({
        address: sender.email,
        category: categories.find((c) => c.id === sender.category?.id) || null,
      })),
    [senders, categories],
  );

  const handleProgressComplete = useCallback(() => {
    // Refresh data when categorization completes
    mutate();
  }, [mutate]);

  const shouldShowOnboarding =
    !isBulkCategorizing && (showOnboarding || !hasCategorizedSenders);

  return (
    <>
      {shouldShowOnboarding ? (
        <AutoCategorizationSetup />
      ) : (
        <PageWrapper>
          <PageHeader title="Bulk Archive" />
          <BulkArchiveProgress onComplete={handleProgressComplete} />
          <BulkArchiveCards emailGroups={emailGroups} categories={categories} />
        </PageWrapper>
      )}
    </>
  );
}
