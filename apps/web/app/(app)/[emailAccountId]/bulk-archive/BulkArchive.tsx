"use client";

import { useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";
import { parseAsBoolean, useQueryState } from "nuqs";
import { AutoCategorizationSetup } from "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup";
import { BulkArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress";
import { BulkArchiveCards } from "@/components/BulkArchiveCards";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import type { CategorizedSendersResponse } from "@/app/api/user/categorize/senders/categorized/route";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";

export function BulkArchive() {
  const { isBulkCategorizing } = useCategorizeProgress();
  const [onboarding] = useQueryState("onboarding", parseAsBoolean);

  // Fetch data with SWR and poll while categorization is in progress
  const { data, error, isLoading, mutate } = useSWR<CategorizedSendersResponse>(
    "/api/user/categorize/senders/categorized",
    {
      refreshInterval: isBulkCategorizing ? 2000 : undefined,
    },
  );

  const senders = data?.senders ?? [];
  const categories = data?.categories ?? [];
  const autoCategorizeSenders = data?.autoCategorizeSenders ?? false;

  const emailGroups = useMemo(
    () =>
      senders.map((sender) => ({
        address: sender.email,
        category: categories.find((c) => c.id === sender.category?.id) || null,
      })),
    [senders, categories],
  );

  const handleProgressComplete = useCallback(() => {
    mutate();
  }, [mutate]);

  const shouldShowSetup =
    onboarding || (!autoCategorizeSenders && !isBulkCategorizing);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {shouldShowSetup ? (
        <AutoCategorizationSetup />
      ) : (
        <PageWrapper>
          <PageHeader
            title="Bulk Archive"
            rightElement={
              <TooltipExplanation text="Archive emails in bulk by category to quickly clean up your inbox." />
            }
          />
          <BulkArchiveProgress onComplete={handleProgressComplete} />
          <BulkArchiveCards emailGroups={emailGroups} categories={categories} />
        </PageWrapper>
      )}
    </LoadingContent>
  );
}
