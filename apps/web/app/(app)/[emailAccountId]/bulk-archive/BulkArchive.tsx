"use client";

import { useMemo, useCallback, useState } from "react";
import useSWR from "swr";
import { parseAsBoolean, useQueryState } from "nuqs";
import { AutoCategorizationSetup } from "@/app/(app)/[emailAccountId]/bulk-archive/AutoCategorizationSetup";
import { BulkArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveProgress";
import {
  BulkArchiveSettingsModal,
  type BulkActionType,
} from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveSettingsModal";
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
  const [bulkAction, setBulkAction] = useState<BulkActionType>("archive");

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

  const [setupDismissed, setSetupDismissed] = useState(false);

  // Show setup dialog for first-time setup only
  const shouldShowSetup =
    !setupDismissed &&
    (onboarding || (!autoCategorizeSenders && !isBulkCategorizing));

  return (
    <LoadingContent loading={isLoading} error={error}>
      <PageWrapper>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PageHeading>Bulk Archive</PageHeading>
            <TooltipExplanation text="Archive emails in bulk by category to quickly clean up your inbox." />
          </div>
          <div className="flex items-center gap-2">
            <BulkArchiveSettingsModal
              selectedAction={bulkAction}
              onActionChange={setBulkAction}
            />
            <CategorizeWithAiButton
              buttonProps={{ variant: "outline", size: "sm" }}
            />
          </div>
        </div>
        <BulkArchiveProgress onComplete={handleProgressComplete} />
        <BulkArchiveCards
          emailGroups={emailGroups}
          categories={categories}
          bulkAction={bulkAction}
          onCategoryChange={mutate}
        />
      </PageWrapper>
      <AutoCategorizationSetup
        open={shouldShowSetup}
        onOpenChange={(open) => {
          if (!open) setSetupDismissed(true);
        }}
      />
    </LoadingContent>
  );
}
