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
import { updateBulkArchiveActionAction } from "@/utils/actions/settings";
import { CleanAction } from "@/generated/prisma/enums";
import { useAccount } from "@/providers/EmailAccountProvider";

export function BulkArchive() {
  const { emailAccountId } = useAccount();
  const { isBulkCategorizing } = useCategorizeProgress();
  const [onboarding] = useQueryState("onboarding", parseAsBoolean);

  // Fetch data with SWR and poll while categorization is in progress
  const { data, error, isLoading, mutate } = useSWR<CategorizedSendersResponse>(
    "/api/user/categorize/senders/categorized",
    {
      refreshInterval: isBulkCategorizing ? 2000 : undefined,
    },
  );

  const bulkAction: BulkActionType =
    (data?.bulkArchiveAction as BulkActionType) ?? CleanAction.ARCHIVE;

  const handleActionChange = useCallback(
    async (action: BulkActionType) => {
      // Optimistic update - immediately update the UI
      const optimisticData = data
        ? { ...data, bulkArchiveAction: action }
        : undefined;

      await mutate(
        async () => {
          // Save to database - emailAccountId is required as first argument
          await updateBulkArchiveActionAction(emailAccountId, {
            bulkArchiveAction: action,
          });
          // Return the optimistic data as the new cache value
          return optimisticData;
        },
        {
          optimisticData,
          revalidate: false, // Don't refetch after - we already have the correct data
        },
      );
    },
    [mutate, data, emailAccountId],
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
              onActionChange={handleActionChange}
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
