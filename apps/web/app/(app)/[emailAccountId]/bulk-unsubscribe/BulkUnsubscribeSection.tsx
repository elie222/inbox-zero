"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { usePostHog } from "posthog-js/react";
import { FilterIcon } from "lucide-react";
import sortBy from "lodash/sortBy";
import { Title } from "@tremor/react";
import type { DateRange } from "react-day-picker";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  NewsletterStatsQuery,
  NewsletterStatsResponse,
} from "@/app/api/user/stats/newsletters/route";
import { useExpanded } from "@/app/(app)/[emailAccountId]/stats/useExpanded";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";
import { NewsletterModal } from "@/app/(app)/[emailAccountId]/stats/NewsletterModal";
import { useEmailsToIncludeFilter } from "@/app/(app)/[emailAccountId]/stats/EmailsToIncludeFilter";
import { DetailedStatsFilter } from "@/app/(app)/[emailAccountId]/stats/DetailedStatsFilter";
import { usePremium } from "@/components/PremiumAlert";
import {
  useNewsletterFilter,
  useBulkUnsubscribeShortcuts,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/hooks";
import { useStatLoader } from "@/providers/StatLoaderProvider";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useLabels } from "@/hooks/useLabels";
import {
  BulkUnsubscribeMobile,
  BulkUnsubscribeRowMobile,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeMobile";
import {
  BulkUnsubscribeDesktop,
  BulkUnsubscribeRowDesktop,
} from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkUnsubscribeDesktop";
import { Card } from "@/components/ui/card";
import { ShortcutTooltip } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ShortcutTooltip";
import { SearchBar } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/SearchBar";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { BulkActions } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/BulkActions";
import { ArchiveProgress } from "@/app/(app)/[emailAccountId]/bulk-unsubscribe/ArchiveProgress";
import { ClientOnly } from "@/components/ClientOnly";
import { Toggle } from "@/components/Toggle";
import { useAccount } from "@/providers/EmailAccountProvider";

type Newsletter = NewsletterStatsResponse["newsletters"][number];

export function BulkUnsubscribeSection({
  dateRange,
  refreshInterval,
  isMobile,
}: {
  dateRange?: DateRange | undefined;
  refreshInterval: number;
  isMobile: boolean;
}) {
  const { emailAccountId, userEmail } = useAccount();

  const [sortColumn, setSortColumn] = useState<
    "emails" | "unread" | "unarchived"
  >("emails");

  const { typesArray } = useEmailsToIncludeFilter();
  const { filtersArray, filters, setFilters } = useNewsletterFilter();
  const posthog = usePostHog();

  const params: NewsletterStatsQuery = {
    types: typesArray,
    filters: filtersArray,
    orderBy: sortColumn,
    limit: 100,
    includeMissingUnsubscribe: true,
    ...getDateRangeParams(dateRange),
  };
  const urlParams = new URLSearchParams(params as any);
  const { data, isLoading, error, mutate } = useSWR<
    NewsletterStatsResponse,
    { error: string }
  >(`/api/user/stats/newsletters?${urlParams}`, {
    refreshInterval,
    keepPreviousData: true,
  });

  const { hasUnsubscribeAccess, mutate: refetchPremium } = usePremium();

  const { expanded, extra } = useExpanded();
  const [openedNewsletter, setOpenedNewsletter] = React.useState<Newsletter>();

  const onOpenNewsletter = (newsletter: Newsletter) => {
    setOpenedNewsletter(newsletter);
    posthog?.capture("Clicked Expand Sender");
  };

  const [selectedRow, setSelectedRow] = React.useState<
    Newsletter | undefined
  >();

  useBulkUnsubscribeShortcuts({
    newsletters: data?.newsletters,
    selectedRow,
    onOpenNewsletter,
    setSelectedRow,
    refetchPremium,
    hasUnsubscribeAccess,
    mutate,
    userEmail,
    emailAccountId,
  });

  const [search, setSearch] = useState("");

  const { isLoading: isStatsLoading } = useStatLoader();

  const { userLabels } = useLabels();

  const { PremiumModal, openModal } = usePremiumModal();

  const RowComponent = isMobile
    ? BulkUnsubscribeRowMobile
    : BulkUnsubscribeRowDesktop;

  const rows = data?.newsletters
    ?.filter(
      search
        ? (item) =>
            item.name.toLowerCase().includes(search.toLowerCase()) ||
            item.unsubscribeLink?.toLowerCase().includes(search.toLowerCase())
        : Boolean,
    )
    .slice(0, expanded ? undefined : 50);

  const { selected, isAllSelected, onToggleSelect, onToggleSelectAll } =
    useToggleSelect(rows?.map((item) => ({ id: item.name })) || []);

  const unsortedTableRows = rows?.map((item) => {
    const readPercentage = (item.readEmails / item.value) * 100;
    const archivedEmails = item.value - item.inboxEmails;
    const archivedPercentage = (archivedEmails / item.value) * 100;

    const row = (
      <RowComponent
        key={item.name}
        item={item}
        userEmail={userEmail}
        emailAccountId={emailAccountId}
        onOpenNewsletter={onOpenNewsletter}
        labels={userLabels}
        mutate={mutate}
        selected={selectedRow?.name === item.name}
        onSelectRow={() => setSelectedRow(item)}
        onDoubleClick={() => onOpenNewsletter(item)}
        hasUnsubscribeAccess={hasUnsubscribeAccess}
        refetchPremium={refetchPremium}
        openPremiumModal={openModal}
        checked={selected.get(item.name) || false}
        onToggleSelect={onToggleSelect}
        readPercentage={readPercentage}
        archivedEmails={archivedEmails}
        archivedPercentage={archivedPercentage}
      />
    );

    return { row, readPercentage, archivedEmails, archivedPercentage };
  });

  const tableRows = sortBy(unsortedTableRows, (row) => {
    if (sortColumn === "unread") return row.readPercentage;
    if (sortColumn === "unarchived") return row.archivedPercentage;
  });

  const onlyUnhandled =
    filters.unhandled &&
    !filters.autoArchived &&
    !filters.unsubscribed &&
    !filters.approved;

  return (
    <>
      <Card className="mt-0 md:mt-4">
        <div className="items-center justify-between px-2 pt-2 sm:px-4 md:flex">
          {Array.from(selected.values()).filter(Boolean).length > 0 ? (
            <BulkActions selected={selected} mutate={mutate} />
          ) : (
            <Title className="hidden md:block">Bulk Unsubscriber</Title>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-end gap-1 md:mt-0 lg:flex-nowrap">
            <div className="mr-2">
              <Toggle
                name="show-unhandled"
                label="Only unhandled"
                enabled={onlyUnhandled}
                onChange={() =>
                  setFilters(
                    onlyUnhandled
                      ? {
                          unhandled: true,
                          autoArchived: true,
                          unsubscribed: true,
                          approved: true,
                        }
                      : {
                          unhandled: true,
                          autoArchived: false,
                          unsubscribed: false,
                          approved: false,
                        },
                  )
                }
              />
            </div>

            <div className="hidden md:block">
              <ShortcutTooltip />
            </div>

            <SearchBar onSearch={setSearch} />

            <DetailedStatsFilter
              label="Filter"
              icon={<FilterIcon className="mr-2 h-4 w-4" />}
              keepOpenOnSelect
              columns={[
                {
                  label: "All",
                  separatorAfter: true,
                  checked:
                    filters.approved &&
                    filters.autoArchived &&
                    filters.unsubscribed &&
                    filters.unhandled,
                  setChecked: () =>
                    setFilters({
                      approved: true,
                      autoArchived: true,
                      unsubscribed: true,
                      unhandled: true,
                    }),
                },
                {
                  label: "Unhandled",
                  checked: filters.unhandled,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      unhandled: !filters.unhandled,
                    }),
                },
                {
                  label: "Unsubscribed",
                  checked: filters.unsubscribed,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      unsubscribed: !filters.unsubscribed,
                    }),
                },
                {
                  label: "Skip Inbox",
                  checked: filters.autoArchived,
                  setChecked: () =>
                    setFilters({
                      ...filters,
                      autoArchived: !filters.autoArchived,
                    }),
                },
                {
                  label: "Approved",
                  checked: filters.approved,
                  setChecked: () =>
                    setFilters({ ...filters, approved: !filters.approved }),
                },
              ]}
            />
          </div>
        </div>

        <ClientOnly>
          <ArchiveProgress />
        </ClientOnly>

        {isStatsLoading && !isLoading && !data?.newsletters.length ? (
          <div className="p-4">
            <Skeleton className="h-screen rounded" />
          </div>
        ) : (
          <LoadingContent
            loading={!data && isLoading}
            error={error}
            loadingComponent={
              <div className="p-4">
                <Skeleton className="h-screen rounded" />
              </div>
            }
          >
            {tableRows?.length ? (
              <>
                {isMobile ? (
                  <BulkUnsubscribeMobile
                    tableRows={tableRows.map((row) => row.row)}
                  />
                ) : (
                  <BulkUnsubscribeDesktop
                    sortColumn={sortColumn}
                    setSortColumn={setSortColumn}
                    tableRows={tableRows.map((row) => row.row)}
                    isAllSelected={isAllSelected}
                    onToggleSelectAll={onToggleSelectAll}
                  />
                )}
                <div className="mt-2 px-6 pb-6">{extra}</div>
              </>
            ) : (
              <p className="max-w-prose space-y-4 p-4 text-muted-foreground">
                No emails found. To see more, adjust the filter options or click
                the "Load More" button.
              </p>
            )}
          </LoadingContent>
        )}
      </Card>
      <NewsletterModal
        newsletter={openedNewsletter}
        onClose={() => setOpenedNewsletter(undefined)}
        refreshInterval={refreshInterval}
      />
      <PremiumModal />
    </>
  );
}
