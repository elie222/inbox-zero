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
import { BulkArchiveSummary } from "@/app/(app)/[emailAccountId]/bulk-archive/BulkArchiveSummary";
import {
  BulkArchiveCards,
  type HeldArchive,
} from "@/components/BulkArchiveCards";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { CategorizeWithAiButton } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeWithAiButton";
import type { CategorizedSendersResponse } from "@/app/api/user/categorize/senders/categorized/route";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeaderVideoButton } from "@/components/PageHeaderVideoButton";
import { LoadingContent } from "@/components/LoadingContent";
import { TooltipExplanation } from "@/components/TooltipExplanation";
import { PageHeading } from "@/components/Typography";
import { EmailStatsPreloader } from "@/components/EmailStatsPreloader";
import { useProductAnalytics } from "@/hooks/useProductAnalytics";

export function BulkArchive() {
  const analytics = useProductAnalytics("bulk_archive");
  const { isBulkCategorizing } = useCategorizeProgress();
  const [onboarding] = useQueryState("onboarding", parseAsBoolean);
  const [bulkAction, setBulkAction] = useState<BulkActionType>("archive");
  const [archivedThisSession, setArchivedThisSession] = useState<{
    baseline: number;
    held: Record<string, HeldArchive>;
  }>();

  // Fetch data with SWR and poll while categorization is in progress
  const { data, error, isLoading, isValidating, mutate } =
    useSWR<CategorizedSendersResponse>(
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
        counts: sender.counts,
      })),
    [senders, categories],
  );

  const fetchedInboxCount = senders.reduce(
    (total, sender) => total + sender.counts.inbox,
    0,
  );
  const heldArchives = archivedThisSession?.held ?? {};
  const archivedCount = Object.values(heldArchives).reduce(
    (total, held) => total + held.count,
    0,
  );
  // The stored counts lag the mail engine, so never show more than we know is left.
  const inboxCount =
    archivedThisSession && archivedCount > 0
      ? Math.min(
          fetchedInboxCount,
          archivedThisSession.baseline - archivedCount,
        )
      : fetchedInboxCount;

  // Unread mail leaves with the categories archived this session.
  const unreadCount = senders.reduce(
    (total, sender) =>
      sender.category && heldArchives[sender.category.name]
        ? total
        : total + sender.counts.unread,
    0,
  );

  const holdArchive = (categoryName: string, held: HeldArchive) =>
    setArchivedThisSession((previous) => ({
      baseline: previous?.baseline ?? fetchedInboxCount,
      held: { ...previous?.held, [categoryName]: held },
    }));

  const releaseArchive = (categoryName: string) =>
    setArchivedThisSession((previous) => {
      if (!previous) return previous;
      const { [categoryName]: _released, ...held } = previous.held;
      return Object.keys(held).length
        ? { baseline: previous.baseline, held }
        : undefined;
    });

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await Promise.all([mutate(), new Promise((r) => setTimeout(r, 700))]);
    } finally {
      setRefreshing(false);
    }
  };

  const handleProgressComplete = useCallback(() => {
    analytics.captureAction("bulk_archive_categorization_completed");
    mutate();
  }, [analytics, mutate]);

  const [setupDismissed, setSetupDismissed] = useState(false);

  // Show setup dialog for first-time setup only
  const shouldShowSetup =
    !setupDismissed &&
    (onboarding || (!autoCategorizeSenders && !isBulkCategorizing));

  return (
    <LoadingContent loading={isLoading} error={error}>
      <EmailStatsPreloader />
      <PageWrapper>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex items-center gap-2">
            <PageHeading>Bulk Archive</PageHeading>
            <TooltipExplanation text="Archive, delete, or mark emails as read in bulk by category to quickly clean up your inbox." />
            <PageHeaderVideoButton
              video={{
                title: "Getting started with Bulk Archive",
                description:
                  "Learn how to archive whole categories of old email at once.",
                muxPlaybackId:
                  "jyy00xnJVvyjVsyNKjclj02r023p200rOyDMAFNUE6Lwnpo",
              }}
            />
          </div>
          <div className="flex items-center gap-2">
            <BulkArchiveSettingsModal
              selectedAction={bulkAction}
              onActionChange={(action) => {
                analytics.captureAction("bulk_archive_action_changed", {
                  action,
                });
                setBulkAction(action);
              }}
            />
            <CategorizeWithAiButton
              buttonProps={{ variant: "outline", size: "sm" }}
            />
          </div>
        </div>
        <BulkArchiveSummary
          inboxCount={inboxCount}
          unreadCount={Math.min(unreadCount, inboxCount)}
          baselineCount={archivedThisSession?.baseline}
          archivedCount={archivedCount}
          fetchedAt={data?.fetchedAt}
          isRefreshing={refreshing || isValidating}
          onRefresh={handleRefresh}
        />
        <BulkArchiveProgress onComplete={handleProgressComplete} />
        <BulkArchiveCards
          emailGroups={emailGroups}
          categories={categories}
          bulkAction={bulkAction}
          onCategoryChange={mutate}
          heldArchives={heldArchives}
          onHoldArchive={holdArchive}
          onReleaseArchive={releaseArchive}
        />
      </PageWrapper>
      <AutoCategorizationSetup
        open={shouldShowSetup}
        onOpenChange={(open) => {
          analytics.captureAction("bulk_archive_setup_dialog_toggled", {
            open,
          });
          if (!open) setSetupDismissed(true);
        }}
      />
    </LoadingContent>
  );
}
