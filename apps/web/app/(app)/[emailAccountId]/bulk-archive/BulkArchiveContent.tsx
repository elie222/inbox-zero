"use client";

import { useMemo, useCallback } from "react";
import sortBy from "lodash/sortBy";
import useSWR from "swr";
import { AutoCategorizationSetup } from "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup";
import { BulkArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress";
import { BulkArchiveCards } from "@/components/BulkArchiveCards";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import type { CategorizedSendersResponse } from "@/app/api/user/categorize/senders/categorized/route";
import type { CategoryWithRules } from "@/utils/category.server";

type Sender = {
  id: string;
  email: string;
  category: { id: string; description: string | null; name: string } | null;
};

export function BulkArchiveContent({
  initialSenders,
  initialCategories,
  showOnboarding = false,
}: {
  initialSenders: Sender[];
  initialCategories: CategoryWithRules[];
  showOnboarding?: boolean;
}) {
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
      sortBy(senders, (sender) => sender.category?.name).map((sender) => ({
        address: sender.email,
        category: categories.find((c) => c.id === sender.category?.id) || null,
      })),
    [senders, categories],
  );

  const handleProgressComplete = useCallback(() => {
    // Refresh data when categorization completes
    mutate();
  }, [mutate]);

  const hasCategorizedSenders = senders.length > 0;
  const shouldShowOnboarding = showOnboarding || !hasCategorizedSenders;

  return (
    <>
      <BulkArchiveProgress onComplete={handleProgressComplete} />
      {shouldShowOnboarding ? (
        <AutoCategorizationSetup />
      ) : (
        <BulkArchiveCards emailGroups={emailGroups} categories={categories} />
      )}
    </>
  );
}
