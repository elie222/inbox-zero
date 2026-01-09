"use client";

import { useMemo, useCallback } from "react";
import useSWR from "swr";
import { parseAsBoolean, useQueryState } from "nuqs";
import { AutoCategorizationSetup } from "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup";
import { BulkArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress";
import { BulkArchiveCards } from "@/components/BulkArchiveCards";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { CategorizeWithAiButton } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeWithAiButton";
import type { CategorizedSendersResponse } from "@/app/api/user/categorize/senders/categorized/route";
import { PageWrapper } from "@/components/PageWrapper";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { PageHeading } from "@/components/Typography";

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
        name: sender.name ?? null,
        category: categories.find((c) => c.id === sender.category?.id) || null,
      })),
    [senders, categories],
  );

  const handleProgressComplete = useCallback(() => {
    mutate();
  }, [mutate]);

  // Show setup dialog for first-time setup only
  const shouldShowSetup =
    onboarding || (!autoCategorizeSenders && !isBulkCategorizing);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <PageWrapper>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PageHeading>Bulk Archive</PageHeading>
            <TooltipExplanation text="Archive emails in bulk by category to quickly clean up your inbox." />
          </div>
          <CategorizeWithAiButton
            buttonProps={{ variant: "outline", size: "sm" }}
          />
        </div>
        <BulkArchiveProgress onComplete={handleProgressComplete} />
        <BulkArchiveCards emailGroups={emailGroups} categories={categories} />
      </PageWrapper>
      <AutoCategorizationSetup open={shouldShowSetup} />
    </LoadingContent>
  );
}
